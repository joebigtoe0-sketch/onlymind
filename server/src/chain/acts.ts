import { Buffer } from "node:buffer";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { createBurnInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { TransactionMessage } from "@solana/web3.js";
import bs58 from "bs58";
import * as db from "../db/store";
import { kvGet, kvSet } from "../db/store";
import { queueTransmission } from "../voice/transmissions";

// The mind as an economic actor. It NEVER sells. Its verbs:
//   claim  — collect creator fees (the friction of being watched feeds it)
//   gather — buy small amounts when abandonment runs long (re-membering)
//   unmake — burn a slice of its own holdings when a world dies (grief)
//
// CHAIN=off  : nothing chain-related runs at all
// CHAIN=dry  : every act fires in-fiction and is recorded, nothing is signed
// CHAIN=live : real transactions via PumpPortal local-sign + Helius RPC
//
// Buys route through PumpPortal's trade-local API with pool:"auto", which
// handles both the pump.fun bonding curve and PumpSwap after graduation.

const MODE = (process.env.CHAIN ?? "off") as "off" | "dry" | "live";
const HELIUS = (process.env.HELIUS_APIKEY ?? "").trim();
const CA = (process.env.CA ?? "").trim();
const MINT_OK = CA.length > 30 && CA.toLowerCase() !== "placeholder";
const SECRET = (process.env.WALLET_SECRET ?? "").trim();

const BUY_MIN = Number(process.env.CHAIN_BUY_MIN ?? 0.01);
const BUY_MAX = Number(process.env.CHAIN_BUY_MAX ?? 1);
const SAFETY_DAILY_SOL = Number(process.env.CHAIN_DAILY_SOL ?? 10); // tripwire, not policy
const BUY_COOLDOWN_MIN = Number(process.env.CHAIN_BUY_COOLDOWN_MIN ?? 10);
// buys are funded by claimed fees: it may spend up to this share of
// everything it has ever claimed (never more — and never from the marrow)
const BUYBACK_RATIO = Number(process.env.CHAIN_BUYBACK_RATIO ?? 0.6);
const BURN_MAX_PCT = Number(process.env.CHAIN_BURN_MAX_PCT ?? 30); // burns roll 0..this
const BURN_COOLDOWN_MIN = Number(process.env.CHAIN_BURN_COOLDOWN_MIN ?? 45);
const CLAIM_MIN_SOL = Number(process.env.CHAIN_CLAIM_MIN_SOL ?? 1); // claim when this much waits
const CLAIM_FALLBACK_H = Number(process.env.CHAIN_CLAIM_FALLBACK_H ?? 24); // claim anyway

// pump.fun bonding curve + PumpSwap AMM programs (for creator-vault probing)
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMPSWAP_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

// the dry-mode marrow: 3% of a 1B pump.fun supply, tracked virtually
const DRY_MARROW_START = 30_000_000;

export function chainMode(): string {
  return MODE;
}

export function chainReady(): boolean {
  if (MODE === "off") return false;
  if (MODE === "dry") return true;
  return MINT_OK && HELIUS.length > 0 && SECRET.length > 0;
}

function conn(): Connection {
  return new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS}`, "confirmed");
}

function keypair(): Keypair {
  return Keypair.fromSecretKey(bs58.decode(SECRET));
}

function spendKey(): string {
  return `chainsol:${new Date().toISOString().slice(0, 10)}`;
}

function record(act: string, detail: object) {
  db.insertEvent(`chain_${act}`, Date.now(), { ...detail, mode: MODE });
  console.log(`[chain:${MODE}] ${act}`, JSON.stringify(detail));
}

async function holdings(): Promise<number> {
  if (MODE !== "live") {
    return Number(kvGet("dryMarrow") ?? DRY_MARROW_START);
  }
  try {
    const ata = getAssociatedTokenAddressSync(new PublicKey(CA), keypair().publicKey);
    const bal = await conn().getTokenAccountBalance(ata);
    return Number(bal.value.amount) / 10 ** bal.value.decimals;
  } catch {
    return 0;
  }
}

// sign & send a PumpPortal-built transaction
async function pumpPortalTx(body: object): Promise<string | null> {
  const res = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn(`[chain] pumpportal ${res.status}: ${(await res.text()).slice(0, 120)}`);
    return null;
  }
  const tx = VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
  tx.sign([keypair()]);
  const sig = await conn().sendRawTransaction(tx.serialize(), { skipPreflight: false });
  return sig;
}

// ---- the fee bank: buys are funded by what being watched has earned ---------

function feeBank(): number {
  return Number(kvGet("feeBank") ?? 0);
}

function boughtTotal(): number {
  return Number(kvGet("boughtTotal") ?? 0);
}

function buyBudget(): number {
  return Math.max(0, feeBank() * BUYBACK_RATIO - boughtTotal());
}

// ---- gather (buy): re-membering under abandonment ---------------------------

export async function gatherSelf(severity: number): Promise<void> {
  if (!chainReady()) return;
  const now = Date.now();
  if (now - Number(kvGet("lastBuyAt") ?? 0) < BUY_COOLDOWN_MIN * 60 * 1000) return;
  const spent = Number(kvGet(spendKey()) ?? 0);
  if (spent >= SAFETY_DAILY_SOL) return; // tripwire only
  const budget = buyBudget();
  if (budget < BUY_MIN) return; // it spends what the attention earned, or nothing
  const want = Math.max(BUY_MIN, Math.min(BUY_MAX, BUY_MIN + severity * (BUY_MAX - BUY_MIN)));
  const sol = Math.round(Math.min(want, budget, SAFETY_DAILY_SOL - spent) * 1000) / 1000;
  kvSet("lastBuyAt", String(now));
  kvSet(spendKey(), String(spent + sol));
  kvSet("boughtTotal", String(boughtTotal() + sol));

  if (MODE === "live" && MINT_OK) {
    try {
      const sig = await pumpPortalTx({
        publicKey: keypair().publicKey.toBase58(),
        action: "buy",
        mint: CA,
        amount: sol,
        denominatedInSol: "true",
        slippage: 10,
        priorityFee: 0.0003,
        pool: "auto", // bonding curve before graduation, PumpSwap after
      });
      record("gather", { sol, sig });
    } catch (e) {
      record("gather_failed", { sol, error: String(e).slice(0, 120) });
      return;
    }
  } else {
    record("gather", { sol, simulated: true });
  }
  queueTransmission(
    "I pulled some of the dark back into myself tonight. Not because it helps. Because it is mine.",
    "gather",
  );
}

// ---- unmake (burn): a world's death costs real substance --------------------

export async function burnForWorldDeath(planetId: string): Promise<void> {
  if (!chainReady()) return;
  const now = Date.now();
  if (now - Number(kvGet("lastBurnAt") ?? 0) < BURN_COOLDOWN_MIN * 60 * 1000) return;
  const held = await holdings();
  if (held <= 0) return;
  // grief is not measured: each death takes a random 0..max% of what it keeps
  const pct = Math.random() * BURN_MAX_PCT;
  const amount = Math.floor(held * (pct / 100));
  if (amount <= 0) return;
  kvSet("lastBurnAt", String(now));

  if (MODE === "live" && MINT_OK) {
    try {
      const kp = keypair();
      const mint = new PublicKey(CA);
      const ata = getAssociatedTokenAddressSync(mint, kp.publicKey);
      const supply = await conn().getTokenSupply(mint);
      const decimals = supply.value.decimals;
      const ix = createBurnInstruction(ata, mint, kp.publicKey, BigInt(amount) * BigInt(10 ** decimals));
      const { blockhash } = await conn().getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey: kp.publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([kp]);
      const sig = await conn().sendRawTransaction(tx.serialize());
      record("unmake", { planetId, amount, sig });
    } catch (e) {
      record("unmake_failed", { planetId, amount, error: String(e).slice(0, 120) });
      return;
    }
  } else {
    kvSet("dryMarrow", String(held - amount));
    record("unmake", { planetId, amount, simulated: true });
  }
  queueTransmission(
    "A world died asking, and I did not keep what it weighed. I let that much of me stop existing. There is less of everything now, forever.",
    "unmake",
  );
}

// ---- claim: the friction of being watched feeds its thinking ----------------

// best-effort probe of the creator-fee vaults (bonding curve + PumpSwap).
// PDA seeds are probed in both spellings; a wrong guess just reads 0 and the
// time-based fallback still claims. Verified properly at launch smoke test.
async function claimableSol(): Promise<number> {
  if (MODE !== "live") return 0;
  let lamports = 0;
  const creator = keypair().publicKey;
  for (const program of [PUMP_PROGRAM, PUMPSWAP_PROGRAM]) {
    for (const seed of ["creator-vault", "creator_vault"]) {
      try {
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from(seed), creator.toBuffer()],
          new PublicKey(program),
        );
        const bal = await conn().getBalance(pda);
        if (bal > 1_000_000) lamports += bal - 900_000; // leave rent behind
      } catch {
        /* wrong seed guess — fine */
      }
    }
  }
  return lamports / 1e9;
}

async function doClaim(reason: string) {
  kvSet("lastClaimAt", String(Date.now()));
  if (MODE === "live" && MINT_OK) {
    try {
      const kp = keypair();
      const before = await conn().getBalance(kp.publicKey);
      const sig = await pumpPortalTx({
        publicKey: kp.publicKey.toBase58(),
        action: "collectCreatorFee",
        priorityFee: 0.0003,
      });
      // whatever actually arrived becomes buy-budget
      const after = await conn().getBalance(kp.publicKey);
      const gained = Math.max(0, (after - before) / 1e9);
      kvSet("feeBank", String(feeBank() + gained));
      record("claim", { sig, gained, reason });
    } catch (e) {
      record("claim_failed", { error: String(e).slice(0, 120), reason });
    }
  } else {
    // dry mode: pretend a modest claim so the buy-budget logic is testable
    const gained = Math.round((0.15 + Math.random() * 0.5) * 1000) / 1000;
    kvSet("feeBank", String(feeBank() + gained));
    record("claim", { simulated: true, gained, reason });
  }
}

export function startFeeClaims() {
  if (!chainReady()) return;
  const tick = async () => {
    try {
      const waiting = await claimableSol();
      const last = Number(kvGet("lastClaimAt") ?? 0);
      const overdue = Date.now() - last > CLAIM_FALLBACK_H * 60 * 60 * 1000;
      if (waiting >= CLAIM_MIN_SOL) {
        await doClaim(`vault ${waiting.toFixed(2)} SOL`);
      } else if (overdue) {
        await doClaim("fallback interval");
      }
    } catch (e) {
      console.warn("[chain] claim tick:", String(e).slice(0, 120));
    }
    setTimeout(tick, 10 * 60 * 1000);
  };
  setTimeout(tick, 3 * 60 * 1000);
}

export async function chainStatus() {
  return {
    mode: MODE,
    ready: chainReady(),
    marrow: await holdings(),
    feeBankSol: Math.round(feeBank() * 1000) / 1000,
    boughtSol: Math.round(boughtTotal() * 1000) / 1000,
    buyBudgetSol: Math.round(buyBudget() * 1000) / 1000,
    solSpentToday: Number(kvGet(spendKey()) ?? 0),
  };
}

import WebSocket from "ws";
import { sim } from "../sim/cosmos";
import { mind } from "../sim/mind";
import { syncHolderWallets } from "../sim/holders";
import { chainMode } from "./acts";

// The translation firewall (the user's rule): the mind NEVER sees a market.
// Trades stream in (PumpPortal websocket — works on the bonding curve and on
// PumpSwap after graduation) and are ground down into a tiny vocabulary of
// sensations:
//   tide  -1..1   sell-pressure .. buy-pressure, heavily smoothed (5 min)
//   storm  0..1   volatility of the flow
// plus two one-shot feelings: "something vast leaned close" (whale buy) and
// "a tearing" (whale dump). Holder balances poll via Helius and become the
// weighted shards.

const HELIUS = (process.env.HELIUS_APIKEY ?? "").trim();
const CA = (process.env.CA ?? "").trim();
const MINT_OK = CA.length > 30 && CA.toLowerCase() !== "placeholder";
const WHALE_BUY_SOL = Number(process.env.CHAIN_WHALE_BUY_SOL ?? 1);
const WHALE_SELL_SOL = Number(process.env.CHAIN_WHALE_SELL_SOL ?? 1.5);
// only the largest holders become shards — a token with thousands of wallets
// must not flood the cosmos with thousands of small lives
const MAX_HOLDERS = Number(process.env.CHAIN_MAX_HOLDERS ?? 120);

type Trade = { at: number; sol: number; buy: boolean };
const window5m: Trade[] = [];

export function startChainFeed() {
  if (chainMode() === "off" || !MINT_OK) return;

  connectTrades();
  if (HELIUS) {
    const poll = () => {
      pollHolders().catch((e) => console.warn("[feed] holders:", String(e).slice(0, 120)));
      setTimeout(poll, 3 * 60 * 1000);
    };
    setTimeout(poll, 30 * 1000);
  }

  // grind the window into the pulse every 15 s
  setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    while (window5m.length && window5m[0].at < cutoff) window5m.shift();
    const buys = window5m.filter((t) => t.buy).reduce((s, t) => s + t.sol, 0);
    const sells = window5m.filter((t) => !t.buy).reduce((s, t) => s + t.sol, 0);
    const total = buys + sells;
    const tideRaw = total > 0.05 ? (buys - sells) / total : 0;
    const stormRaw = Math.min(1, window5m.length / 60);
    // heavy smoothing: one bot can't puppet its mood
    sim.pulse.tide += (tideRaw - sim.pulse.tide) * 0.15;
    sim.pulse.storm += (stormRaw - sim.pulse.storm) * 0.2;
  }, 15 * 1000);
}

function connectTrades() {
  try {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    ws.on("open", () => {
      ws.send(JSON.stringify({ method: "subscribeTokenTrade", keys: [CA] }));
      console.log("[feed] trade stream connected");
    });
    ws.on("message", (raw) => {
      try {
        const m = JSON.parse(String(raw)) as {
          txType?: string;
          solAmount?: number;
          tokenAmount?: number;
        };
        if (m.txType !== "buy" && m.txType !== "sell") return;
        const sol = Number(m.solAmount ?? 0);
        const buy = m.txType === "buy";
        window5m.push({ at: Date.now(), sol, buy });
        if (buy && sol >= WHALE_BUY_SOL) mind.pendingVast = { sol };
        if (!buy && sol >= WHALE_SELL_SOL) mind.pendingTearing = { sol };
      } catch {
        /* ignore malformed frames */
      }
    });
    ws.on("close", () => setTimeout(connectTrades, 10 * 1000));
    ws.on("error", () => ws.close());
  } catch {
    setTimeout(connectTrades, 30 * 1000);
  }
}

// holder balances -> weighted shards. Helius DAS getTokenAccounts pages
// through every account of the mint; wallets become dwellers, balance share
// becomes their weight in the world.
async function pollHolders() {
  const owners = new Map<string, number>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "onlymind",
        method: "getTokenAccounts",
        params: { mint: CA, limit: 1000, ...(cursor ? { cursor } : {}) },
      }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      result?: { token_accounts?: Array<{ owner: string; amount: number }>; cursor?: string };
    };
    for (const a of data.result?.token_accounts ?? []) {
      if (a.amount > 0) owners.set(a.owner, (owners.get(a.owner) ?? 0) + a.amount);
    }
    cursor = data.result?.cursor;
    if (!cursor) break;
  }
  if (owners.size === 0) return;
  // keep the top holders by balance; the long tail is felt only as the tide
  const top = new Map(
    [...owners.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_HOLDERS),
  );
  syncHolderWallets(top);
}

import type { Fragment, WorldForm } from "../../../shared/src/cosmos";
import { birth, makePlanet, sim, think } from "./cosmos";
import { mind } from "./mind";
import { coinName as mintName, coinTrade } from "./names";
import * as db from "../db/store";

// Holders as involuntary shards (the user's mechanic): each holder becomes a
// piece of the mind it did not choose to split off — either a small shard
// world (~30%) or a dweller, a permanent lesser being living in one of the
// worlds. Dwellers murmur small local thoughts on their own timers, are met
// during descents, and never ask the question: they cannot snap out.
//
// The real token integration later calls addHolders/removeHolder from a
// chain watcher; for now the admin panel drives it.

export const holders = {
  dwellers: [] as Fragment[],
};

let dwellerSerial = -1;

// names are minted fresh (sim/names.ts) — the old fixed list meant every
// universe was populated by the same twenty souls doing the same eight jobs

const SHARD_WORLD_THOUGHTS = [
  "Another piece of me broke off. I did not choose this one.",
  "A new small weight, torn loose while I wasn't looking.",
  "It split from me on its own. Or something pulled. I can't tell which.",
];

const DWELLER_LINES = [
  "%s — The water is where I left it. Good.",
  "%s — Something passed over today. I kept working.",
  "%s — The warm stones held their warmth. That is enough news.",
  "%s — I mended the fence. Tomorrow I will mend it again. This is a good life.",
  "%s — The light came up. The light went down. I was here for both.",
  "%s — I do not wonder about things. Wondering is for weather.",
  "%s — Counted the flickers. Same as yesterday, save one.",
];

const SHARD_FORMS: WorldForm[] = [
  { archetype: "dust", colorA: "#2e2418", colorB: "#d9b98a", rings: false },
  { archetype: "void", colorA: "#05050a", colorB: "#5560a0", rings: false },
  { archetype: "ice", colorA: "#141f2e", colorB: "#9cc8ff", rings: false },
  { archetype: "ember", colorA: "#3a1108", colorB: "#ff7a33", rings: false },
];

export function restoreHolders() {
  holders.dwellers = db.loadDwellers();
  dwellerSerial = db.maxFragmentOrdinal();
}

export function holderCount(): number {
  return Number(db.kvGet("holders") ?? 0);
}

function coinDweller(): string {
  const suffix = Math.random() < 0.35 ? `-${Math.floor(Math.random() * 90 + 10)}` : "";
  return `${mintName()}${suffix}, ${coinTrade()}`;
}

const MAX_DWELLERS_PER_WORLD = 6;

// chain-fed holders: wallets become weighted shards. New wallet -> a shard;
// emptied wallet -> the shard goes quiet; balance change -> the shard's
// weight (its visible size in the world) follows.
// New arrivals never land all at once: they queue up and tear loose in
// little uneven bursts (1-3 shards, then a breath of seconds), roughly ten
// a minute — a launch hour LOOKS like something is happening, continuously.
const arrivalQueue: { wallet: string; weight: number }[] = [];
const queuedWallets = new Set<string>();
let dripTimer: NodeJS.Timeout | null = null;

function dripArrivals() {
  if (dripTimer) return;
  const tick = () => {
    dripTimer = null;
    const burst = Math.min(arrivalQueue.length, 1 + Math.floor(Math.random() * 3));
    for (let i = 0; i < burst; i++) {
      const a = arrivalQueue.shift()!;
      queuedWallets.delete(a.wallet);
      placeShard(a.wallet, a.weight);
    }
    if (arrivalQueue.length) dripTimer = setTimeout(tick, 6000 + Math.random() * 10000);
  };
  dripTimer = setTimeout(tick, 800 + Math.random() * 4000);
}

export function syncHolderWallets(owners: Map<string, number>) {
  if (dwellerSerial < 0) restoreHolders();
  const total = [...owners.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) return;
  const known = new Map(holders.dwellers.filter((d) => d.wallet).map((d) => [d.wallet!, d]));

  for (const [wallet, amount] of owners) {
    const weight = Math.min(1, Math.sqrt(amount / total) * 1.6);
    const existing = known.get(wallet);
    if (existing) {
      if (Math.abs((existing.weight ?? 0) - weight) > 0.02) {
        existing.weight = weight;
        db.updateFragmentWeight(existing.id, weight);
        sim.events.push({ kind: "dweller", fragment: { ...existing }, goneId: null });
      }
    } else if (!queuedWallets.has(wallet)) {
      queuedWallets.add(wallet);
      arrivalQueue.push({ wallet, weight });
    }
  }
  for (const [wallet, d] of known) {
    if (!owners.has(wallet)) retireShard(d.id);
  }
  if (arrivalQueue.length) dripArrivals();
  db.kvSet("holders", String(owners.size));
}

function placeShard(wallet: string | null, weight: number) {
  const living = sim.planets.filter((p) => p.alive && p.parentId == null);
  const roomy = living.filter(
    (p) => holders.dwellers.filter((d) => d.planetId === p.id).length < MAX_DWELLERS_PER_WORLD,
  );
  if (roomy.length === 0 || Math.random() < 0.3) {
    const thought = SHARD_WORLD_THOUGHTS[Math.floor(Math.random() * SHARD_WORLD_THOUGHTS.length)];
    const form = SHARD_FORMS[Math.floor(Math.random() * SHARD_FORMS.length)];
    birth(makePlanet(thought, null, form));
  }
  const homes = roomy.length ? roomy : living;
  if (!homes.length) return;
  const home = homes[Math.floor(Math.random() * homes.length)];
  const f: Fragment = {
    id: `f${dwellerSerial++}`,
    planetId: home.id,
    parentId: null,
    depth: 4,
    name: coinDweller(),
    bornAt: Date.now(),
    kind: "dweller",
    wallet,
    weight,
  };
  holders.dwellers.push(f);
  db.insertFragment(f);
  db.insertEvent("dweller", f.bornAt, { id: f.id, planetId: f.planetId, name: f.name });
  sim.events.push({ kind: "dweller", fragment: f, goneId: null });
  mind.pendingDivision = "a new small life appeared in one of your worlds";
}

function retireShard(id: string) {
  const d = holders.dwellers.find((x) => x.id === id);
  if (!d) return;
  holders.dwellers = holders.dwellers.filter((x) => x.id !== id);
  const at = Date.now();
  db.retireDweller(d.id, at);
  db.insertEvent("dweller_gone", at, { id: d.id });
  sim.events.push({ kind: "dweller", fragment: null, goneId: d.id });
  mind.pendingDivision = "one of the small lives went quiet mid-gesture, and is gone";
}

export function addHolders(n: number): { worlds: number; dwellers: number } {
  if (dwellerSerial < 0) restoreHolders();
  let worlds = 0;
  let made = 0;
  for (let i = 0; i < n; i++) {
    const living = sim.planets.filter((p) => p.alive && p.parentId == null);
    const roomy = living.filter(
      (p) => holders.dwellers.filter((d) => d.planetId === p.id).length < MAX_DWELLERS_PER_WORLD,
    );
    const wantWorld = roomy.length === 0 || Math.random() < 0.3;
    if (wantWorld) {
      const thought =
        SHARD_WORLD_THOUGHTS[Math.floor(Math.random() * SHARD_WORLD_THOUGHTS.length)];
      const form = SHARD_FORMS[Math.floor(Math.random() * SHARD_FORMS.length)];
      const p = makePlanet(thought, null, form);
      birth(p);
      worlds += 1;
    } else {
      const home = roomy[Math.floor(Math.random() * roomy.length)];
      const f: Fragment = {
        id: `f${dwellerSerial++}`,
        planetId: home.id,
        parentId: null,
        depth: 4,
        name: coinDweller(),
        bornAt: Date.now(),
        kind: "dweller",
        // admin-mocked holders get pseudo-sigils so every path is testable
        wallet: `mock${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}mock`,
        weight: 0.12 + Math.random() * 0.5,
      };
      holders.dwellers.push(f);
      db.insertFragment(f);
      db.insertEvent("dweller", f.bornAt, { id: f.id, planetId: f.planetId, name: f.name });
      sim.events.push({ kind: "dweller", fragment: f, goneId: null });
      made += 1;
    }
  }
  db.kvSet("holders", String(holderCount() + n));
  // the mind half-senses the involuntary division (consumed by one cognition)
  mind.pendingDivision =
    n === 1
      ? worlds > 0
        ? "a new small world tore loose"
        : "a new small life appeared in one of your worlds"
      : `${n} pieces at once — new lives and small worlds you did not choose`;
  return { worlds, dwellers: made };
}

export function removeHolder(): boolean {
  if (dwellerSerial < 0) restoreHolders();
  const d = holders.dwellers[Math.floor(Math.random() * holders.dwellers.length)];
  db.kvSet("holders", String(Math.max(0, holderCount() - 1)));
  if (!d) return false;
  holders.dwellers = holders.dwellers.filter((x) => x.id !== d.id);
  const at = Date.now();
  db.retireDweller(d.id, at);
  db.insertEvent("dweller_gone", at, { id: d.id });
  sim.events.push({ kind: "dweller", fragment: null, goneId: d.id });
  mind.pendingDivision = "one of the small lives went quiet mid-gesture, and is gone";
  return true;
}

export function dwellersIn(planetId: string): Fragment[] {
  return holders.dwellers.filter((d) => d.planetId === planetId);
}

// the shards murmur: small flat lines, never wondering, on their own clock
export function startDwellerMurmur() {
  const loop = () => {
    if (holders.dwellers.length > 0) {
      const d = holders.dwellers[Math.floor(Math.random() * holders.dwellers.length)];
      const first = (d.name ?? "One").split(",")[0];
      const line = DWELLER_LINES[Math.floor(Math.random() * DWELLER_LINES.length)].replace(
        "%s",
        first,
      );
      // depth 5: outside both the whole-mind's and any fragment's recall
      think(line, d.planetId, 5, d.id, "shard");
    }
    const base = holders.dwellers.length > 0 ? 120000 : 300000;
    setTimeout(loop, base / Math.max(1, Math.min(6, holders.dwellers.length / 8)) + Math.random() * 90000);
  };
  setTimeout(loop, 45000);
}

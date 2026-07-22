import crypto from "node:crypto";
import type {
  CosmicEvent,
  FocusPhase,
  FocusState,
  Mark,
  Planet,
  Thought,
  WorldForm,
} from "../../../shared/src/cosmos";
import * as db from "../db/store";

// The one authoritative cosmos (§4). Hot state in RAM; every durable change
// writes through to SQLite (§13), so the mind survives restarts with its whole
// history intact. Mutators queue cosmic events; the tick loop flushes them to
// every connected spectator.

export const sim = {
  seed: "",
  tick: 0,
  ignitionAt: null as number | null,
  moodTarget: 0.5,
  planets: [] as Planet[],
  liveThoughts: [] as Thought[],
  focus: { phase: "core", planetId: null, sinceAt: Date.now() } as FocusState,
  events: [] as CosmicEvent[],
  marks: [] as Mark[], // spectator-left traces (§9)
  pendingMark: null as Mark | null, // a mark awaiting discovery by the mind
  attentionSpikePending: false, // the crowd just arrived; the mind will feel it
  // the pulse: market flow ground down into sensation (never seen as a market)
  pulse: { tide: 0, storm: 0 }, // tide -1..1 (out..in), storm 0..1
};

const PALETTE_ORDER = [4, 2, 0, 5, 3, 1]; // gold, violet, ember, ice, rose, teal
let planetOrdinal = 0;
let thoughtSerial = 0;

// Open the archive and either resume the existing world or begin a new one.
// Returns true when this is a fresh mind (the driver then runs the opening).
export function restoreOrCreate(): boolean {
  db.initDb();
  const seed = db.kvGet("seed");
  if (seed == null) {
    sim.seed = crypto.randomBytes(8).toString("hex");
    db.kvSet("seed", sim.seed);
    return true;
  }
  sim.seed = seed;
  const ignitionAt = db.kvGet("ignitionAt");
  sim.ignitionAt = ignitionAt == null ? null : Number(ignitionAt);
  sim.tick = Number(db.kvGet("tick") ?? 0);
  const mind = db.loadMind();
  sim.moodTarget = mind.mood;
  // if the server died mid-fixation, the mind wakes surfaced — a driver
  // episode is not running anymore to release the old focus
  sim.focus = { phase: "core", planetId: null, sinceAt: Date.now() };
  if (mind.focus.phase !== "core") db.saveMind(sim.moodTarget, sim.focus);
  sim.planets = db.loadPlanets();
  sim.liveThoughts = db.recentThoughts(Date.now() - 12000);
  sim.marks = db.loadMarks();
  planetOrdinal = db.maxPlanetOrdinal();
  thoughtSerial = db.maxThoughtOrdinal();
  return false;
}

export function persistTick(belief?: number, certainty?: number): void {
  db.kvSet("tick", String(sim.tick));
  db.saveMind(sim.moodTarget, sim.focus, belief, certainty);
}

export function ignite() {
  sim.ignitionAt = Date.now();
  db.kvSet("ignitionAt", String(sim.ignitionAt));
  warmMood(0.3);
}

const HEX = /^#?[0-9a-fA-F]{6}$/;

// validate a brain-authored form; a malformed one falls back to null (client
// derives a stable look from the palette instead)
export function sanitizeForm(f: unknown): WorldForm | null {
  if (!f || typeof f !== "object") return null;
  const o = f as Record<string, unknown>;
  const archetypes = ["ember", "ocean", "storm", "ice", "verdant", "dust", "crystal", "void"];
  if (typeof o.archetype !== "string" || !archetypes.includes(o.archetype)) return null;
  if (typeof o.colorA !== "string" || !HEX.test(o.colorA)) return null;
  if (typeof o.colorB !== "string" || !HEX.test(o.colorB)) return null;
  const norm = (c: string) => (c.startsWith("#") ? c : `#${c}`).toLowerCase();
  return {
    archetype: o.archetype as WorldForm["archetype"],
    colorA: norm(o.colorA),
    colorB: norm(o.colorB),
    rings: o.rings === true,
  };
}

export function makePlanet(
  birthThought: string,
  parentId: string | null = null,
  form: WorldForm | null = null,
): Planet {
  const i = planetOrdinal++;
  if (parentId) {
    // a satellite: something the mind hallucinated into a world's sky —
    // a small sun, a pale moon, weather given a body
    const siblings = sim.planets.filter((p) => p.parentId === parentId).length;
    return {
      id: `w${i}`,
      bornAt: Date.now(),
      birthThought,
      parentId,
      form,
      orbitRadius: 2.1 + siblings * 1.5 + Math.random() * 0.6,
      inclination: (Math.random() - 0.5) * 0.7,
      ascendingNode: Math.random() * Math.PI * 2,
      phase0: Math.random() * Math.PI * 2,
      paletteIndex: PALETTE_ORDER[i % PALETTE_ORDER.length],
      targetMass: 0.07 + Math.random() * 0.09,
      returns: 0,
      alive: true,
      diedAt: null,
    };
  }
  // the expanding universe: every world is BORN near the center and drifts
  // outward with age (client computes the expansion deterministically) —
  // new thoughts bloom inside, old ones are pushed ever further out
  return {
    id: `w${i}`,
    bornAt: Date.now(),
    birthThought,
    parentId: null,
    form,
    orbitRadius: 6 + Math.random() * 3.5,
    inclination: (Math.random() - 0.5) * 0.55,
    ascendingNode: Math.random() * Math.PI * 2,
    phase0: Math.random() * Math.PI * 2,
    paletteIndex: PALETTE_ORDER[i % PALETTE_ORDER.length],
    targetMass: 0.18 + Math.random() * 0.2,
    returns: 0,
    alive: true,
    diedAt: null,
  };
}

export function birth(p: Planet) {
  sim.planets.push(p);
  sim.events.push({ kind: "birth", planet: p });
  db.insertPlanet(p);
  db.insertEvent("birth", p.bornAt, { planetId: p.id, birthThought: p.birthThought });
  warmMood(0.14);
}

export function recur(planetId: string, dm: number) {
  const p = sim.planets.find((x) => x.id === planetId);
  if (!p) return;
  p.targetMass = Math.min(3, p.targetMass + dm);
  p.returns += 1;
  sim.events.push({ kind: "recur", planetId, targetMass: p.targetMass, returns: p.returns });
  db.updatePlanetAccretion(p.id, p.targetMass, p.returns);
  db.insertEvent("recur", Date.now(), { planetId, targetMass: p.targetMass });
}

export function think(
  text: string,
  planetId: string | null = null,
  depth = 0,
  fragmentId: string | null = null,
  voice?: "self" | "other" | "shard",
) {
  const t: Thought = {
    id: `t${thoughtSerial++}`,
    text,
    at: Date.now(),
    planetId,
    ...(voice ? { voice } : {}),
  };
  sim.liveThoughts.push(t);
  sim.events.push({ kind: "thought", thought: t });
  db.insertThought(t, depth, fragmentId);
}

// a mark appears (§9): a spectator left one word in the dark. The mind will
// find it in a few minutes and have to explain it to itself.
let markSerial = 0;

export function leaveMark(word: string): Mark {
  if (markSerial === 0) markSerial = sim.marks.length;
  const m: Mark = { id: `m${markSerial++}`, word, at: Date.now(), foundAt: null };
  sim.marks.push(m);
  db.insertMark(m);
  db.insertEvent("mark", m.at, { id: m.id, word });
  sim.events.push({ kind: "mark", mark: m });
  setTimeout(() => {
    sim.pendingMark = m; // the next cognition discovers it
  }, 60000 + Math.random() * 180000);
  return m;
}

export function markDiscovered(m: Mark) {
  m.foundAt = Date.now();
  db.markFound(m.id, m.foundAt);
  sim.events.push({ kind: "mark", mark: { ...m } });
}

export function setFocus(phase: FocusPhase, planetId: string | null = null) {
  sim.focus = {
    phase,
    planetId: planetId ?? (phase === "core" ? null : sim.focus.planetId),
    sinceAt: Date.now(),
  };
  sim.events.push({ kind: "focus", focus: sim.focus });
  db.saveMind(sim.moodTarget, sim.focus);
  db.insertEvent("focus", sim.focus.sinceAt, { phase, planetId: sim.focus.planetId });
}

export function warmMood(amount: number) {
  sim.moodTarget = Math.min(1, sim.moodTarget + amount);
}

export function coolMood(amount: number) {
  sim.moodTarget = Math.max(0, sim.moodTarget - amount);
}

export function heaviest(): Planet | undefined {
  return sim.planets.filter((p) => p.alive).sort((a, b) => b.targetMass - a.targetMass)[0];
}

export function randomPlanet(): Planet | undefined {
  const alive = sim.planets.filter((p) => p.alive);
  return alive[Math.floor(Math.random() * alive.length)];
}

export function alivePlanetCount(): number {
  return sim.planets.filter((p) => p.alive).length;
}

export function planetLog(planetId: string): Thought[] {
  return db.thoughtsForPlanet(planetId);
}

export function thoughtCount(): number {
  return db.countThoughts();
}

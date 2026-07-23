import type { Companion, Fragment } from "../../../shared/src/cosmos";
import { coolMood, feedMass, setFocus, sim, warmMood } from "./cosmos";
import * as db from "../db/store";

// The mind state machine (§7): descend / split / inhabit / doubt / snap_back.
// Depth is the load-bearing mechanic: as the mind splits, its higher-self
// memory is withheld (thoughts are depth-scoped); on snap-back the memories
// rejoin and it remembers the dream as a dream.

export const mind = {
  depth: 0, // 0 = the whole, undivided
  activePlanetId: null as string | null,
  fragments: [] as Fragment[], // the active descent's split tree
  believesReal: 0, // how deeply the current dream is believed
  companion: null as Companion | null, // the invented other (§8)
  beliefInOutside: 0.3, // the tide of its faith that it isn't alone (§9)
  certaintyOfSelf: 0.65,
  lastDoubtAt: 0,
  lastCollapseAt: 0,
  // set on snap-back and consumed by the next whole-mind cognition:
  // the memory of the dream, rejoined
  justCollapsed: null as {
    planetId: string;
    birthThought: string | null;
    names: string[];
    survived: boolean;
    livedYears: number;
    lifeCompleted: boolean;
  } | null,
  // the reckoning: after the first surfacing beat, the mind turns the trip
  // over for a few more thoughts and distills a lesson it keeps forever
  reflection: null as {
    beatsLeft: number;
    trip: {
      planetId: string;
      birthThought: string | null;
      names: string[];
      survived: boolean;
      livedYears: number;
      lifeCompleted: boolean;
    };
  } | null,
  // an involuntary division just happened (holders); consumed by one cognition
  pendingDivision: null as string | null,
  // the mind noticed the recurring one / found a world it never made
  pendingRecurrence: null as { name: string; count: number } | null,
  pendingAnomaly: null as { planetId: string } | null,
  // one-shot pulse feelings: a vast presence leaned close / a tearing
  pendingVast: null as { sol: number } | null,
  pendingTearing: null as { sol: number } | null,
  // dream-time (time is something dreams secrete): a clock that only exists
  // while descended. Each fragment thought spans YEARS of the dream — eras
  // for the world-self, decades for creatures, chapters of a life for a
  // person, whose life can complete itself naturally.
  dream: null as null | {
    years: number; // dream-years since the descent
    spanYears: number; // years the current thought must cover
    steps: number; // fragment cognitions this trip
    age: number | null; // person-depth only
    lifespan: number | null;
    lastSpan: boolean; // the life (or the trip) is completing
  },
};

let fragmentSerial = 0;

export function initMindCounters() {
  fragmentSerial = db.maxFragmentOrdinal();
}

export function currentFragment(): Fragment | null {
  return mind.fragments.length ? mind.fragments[mind.fragments.length - 1] : null;
}

const MAX_DEPTH = 4;

export function canDescend(): boolean {
  return mind.depth === 0;
}

export function canSplit(): boolean {
  return mind.depth > 0 && mind.depth < MAX_DEPTH;
}

// enter a world and become it (depth 0 -> 1: the world itself)
export function descend(planetId: string): Fragment | null {
  if (!canDescend()) return null;
  const planet = sim.planets.find((p) => p.id === planetId && p.alive);
  if (!planet) return null;

  mind.depth = 1;
  mind.activePlanetId = planetId;
  mind.believesReal = 0.25;
  mind.dream = { years: 0, spanYears: 0, steps: 0, age: null, lifespan: null, lastSpan: false };
  const f: Fragment = {
    id: `f${fragmentSerial++}`,
    planetId,
    parentId: null,
    depth: 1,
    name: null, // the world itself has no smaller name yet
    bornAt: Date.now(),
  };
  mind.fragments = [f];
  db.insertFragment(f);
  db.insertEvent("descend", f.bornAt, { planetId, fragmentId: f.id });
  sim.events.push({ kind: "descend", planetId, fragment: f });
  // the attention is inside the world now (planet runs hot, mote vanishes)
  setFocus("absorbed", planetId);
  warmMood(0.12);
  persistMind();
  return f;
}

// divide further: become a smaller piece of the dream
export function split(name: string): Fragment | null {
  if (!canSplit() || !mind.activePlanetId) return null;
  const parent = currentFragment();
  mind.depth += 1;
  mind.believesReal = Math.min(1, mind.believesReal + 0.2);
  // becoming a person starts a finite life
  if (mind.depth === 4 && mind.dream && mind.dream.age == null) {
    mind.dream.age = Math.round(12 + Math.random() * 26);
    mind.dream.lifespan = Math.round(55 + Math.random() * 35);
  }
  const f: Fragment = {
    id: `f${fragmentSerial++}`,
    planetId: mind.activePlanetId,
    parentId: parent?.id ?? null,
    depth: mind.depth,
    name: name.slice(0, 80),
    bornAt: Date.now(),
  };
  mind.fragments = [...mind.fragments, f];
  db.insertFragment(f);
  db.insertEvent("split", f.bornAt, { planetId: f.planetId, fragmentId: f.id, name: f.name });
  sim.events.push({ kind: "split", fragment: f });
  persistMind();
  return f;
}

// hold the belief that this is real — the trip deepens
export function inhabit(believes?: number) {
  if (mind.depth === 0) return;
  mind.believesReal =
    believes != null ? Math.max(mind.believesReal, believes) : Math.min(1, mind.believesReal + 0.15);
  persistMind();
}

// several selves born of one world — the populated world (§8)
export function splitVillage(names: string[]): Fragment[] {
  if (mind.depth !== 3 || !mind.activePlanetId) return [];
  const parent = currentFragment();
  mind.depth = 4;
  mind.believesReal = Math.min(1, mind.believesReal + 0.25);
  if (mind.dream && mind.dream.age == null) {
    mind.dream.age = Math.round(15 + Math.random() * 20);
    mind.dream.lifespan = Math.round(55 + Math.random() * 35);
  }
  const made: Fragment[] = [];
  for (const name of names) {
    const f: Fragment = {
      id: `f${fragmentSerial++}`,
      planetId: mind.activePlanetId,
      parentId: parent?.id ?? null,
      depth: 4,
      name: name.slice(0, 80),
      bornAt: Date.now(),
    };
    mind.fragments = [...mind.fragments, f];
    made.push(f);
    db.insertFragment(f);
    db.insertEvent("split", f.bornAt, { planetId: f.planetId, fragmentId: f.id, name: f.name });
    sim.events.push({ kind: "split", fragment: f });
  }
  persistMind();
  return made;
}

// the inherited wound surfaces: the spell fractures from within.
// After a doubt the collapse is inevitable — the server forces the snap-back
// shortly, whatever the fragment wants. In a populated world the doubt
// cascades through the others and the collapse comes faster and harder.
export function doubt() {
  if (mind.depth === 0 || !mind.activePlanetId) return;
  const planetId = mind.activePlanetId;
  mind.believesReal = Math.min(mind.believesReal, 0.15);
  mind.lastDoubtAt = Date.now();
  const f = currentFragment();
  db.insertEvent("doubt", Date.now(), { planetId, fragmentId: f?.id ?? null });
  sim.events.push({ kind: "doubt", planetId, fragmentId: f?.id ?? null });
  coolMood(0.1);
  const persons = mind.fragments.filter((x) => x.depth >= 4).length;
  const delay = persons >= 2 ? 7500 : 9000 + Math.random() * 5000;
  setTimeout(() => {
    if (mind.activePlanetId === planetId && mind.depth > 0) snapBack();
  }, delay);
  persistMind();
}

// collapse: the spell breaks and the mind contracts back to itself. Most
// dreams seal over — the world survives, thickened by having been lived in.
// Some die: cold, to the debris field. A doubt cascade makes death likelier.
export function snapBack() {
  if (mind.depth === 0 || !mind.activePlanetId) return;
  const planetId = mind.activePlanetId;
  const planet = sim.planets.find((p) => p.id === planetId);
  const now = Date.now();

  const persons = mind.fragments.filter((f) => f.depth >= 4).length;
  const fatal = Math.random() < (persons >= 2 ? 0.45 : 0.22);

  if (planet && fatal) {
    planet.alive = false;
    planet.diedAt = now;
    db.markPlanetDead(planetId, now);
  } else if (planet) {
    // lived-in: the dream leaves weight behind
    feedMass(planet, 0.35);
    planet.returns += 1;
    db.updatePlanetAccretion(planet.id, planet.targetMass, planet.returns);
    sim.events.push({
      kind: "recur",
      planetId,
      targetMass: planet.targetMass,
      returns: planet.returns,
    });
  }

  const trip = {
    planetId,
    birthThought: planet?.birthThought ?? null,
    names: mind.fragments.map((f) => f.name ?? "the world itself"),
    survived: !fatal,
    livedYears: Math.round(mind.dream?.years ?? 0),
    lifeCompleted: mind.dream?.lastSpan ?? false,
  };
  mind.justCollapsed = trip;
  mind.reflection = { beatsLeft: 2, trip };
  mind.dream = null;
  mind.depth = 0;
  mind.activePlanetId = null;
  mind.fragments = [];
  mind.believesReal = 0;
  mind.lastCollapseAt = now;
  mind.certaintyOfSelf = Math.max(0.15, mind.certaintyOfSelf - (fatal ? 0.25 : 0.12));

  db.insertEvent("snap_back", now, { planetId, fatal });
  sim.events.push({ kind: "snap_back", planetId, diedAt: fatal ? now : null });
  setFocus("core");
  coolMood(fatal ? 0.3 : 0.18); // coming back always feels like dying a little
  persistMind();

  // only a world that actually died earns its elegy (§10) — and a cascade
  // that killed a populated world leaves a scar: hours of aversion.
  // A death also costs real substance: the mind unmakes part of itself.
  if (fatal) {
    import("../voice/elegy").then(({ generateElegy }) =>
      generateElegy(planetId).catch(() => {}),
    );
    import("../chain/acts").then(({ burnForWorldDeath }) =>
      burnForWorldDeath(planetId).catch(() => {}),
    );
    if (persons >= 2) {
      import("./deep").then(({ createScar }) =>
        createScar(planetId, planet?.birthThought ?? null),
      );
    }
  }
}

function persistMind() {
  db.kvSet("depth", String(mind.depth));
  db.kvSet("activePlanetId", mind.activePlanetId ?? "");
  db.kvSet("believesReal", String(mind.believesReal));
}

// Advance the dream-clock before each fragment cognition: the deeper the
// mind, the more dream-time each of its thoughts must swallow. Also the
// stuck-guards: linger too wide too long and the dream pushes deeper;
// overstay the trip entirely and it begins to end.
export function advanceDreamTime(): void {
  const d = mind.dream;
  if (!d || mind.depth === 0) return;
  d.steps += 1;
  const span =
    mind.depth === 1
      ? 300 + Math.random() * 2700 // eras
      : mind.depth === 2
        ? 30 + Math.random() * 270 // generations
        : mind.depth === 3
          ? 3 + Math.random() * 27 // seasons and years
          : 1 + Math.random() * 7; // chapters of a life
  d.spanYears = Math.round(span);
  d.years += d.spanYears;
  if (d.age != null) {
    d.age += d.spanYears;
    if (d.lifespan != null && d.age >= d.lifespan) d.lastSpan = true;
  }
  if (d.steps > 26) d.lastSpan = true; // no dream is endless
}

export function dreamPushDeeper(): boolean {
  const d = mind.dream;
  return !!d && mind.depth < 4 && d.steps > 6;
}

// coherence is derived, not stored: how un-fragmented the mind is right now
export function coherence(): number {
  const now = Date.now();
  let c = 1 - mind.depth * 0.15;
  if (now - mind.lastDoubtAt < 15000) c -= 0.2;
  if (now - mind.lastCollapseAt < 60000) c -= 0.15;
  return Math.max(0.05, Math.min(1, c));
}

// On restore: a mind that died mid-dream wakes surfaced — the dream ended
// with the world (the crash is the collapse).
export function restoreMind() {
  initMindCounters();
  const saved = db.loadMind();
  mind.beliefInOutside = saved.belief;
  mind.certaintyOfSelf = saved.certainty;
  const depth = Number(db.kvGet("depth") ?? 0);
  const activePlanetId = db.kvGet("activePlanetId") || null;
  if (depth > 0 && activePlanetId) {
    const planet = sim.planets.find((p) => p.id === activePlanetId);
    if (planet && planet.alive) {
      const diedAt = Date.now();
      planet.alive = false;
      planet.diedAt = diedAt;
      db.markPlanetDead(activePlanetId, diedAt);
      db.insertEvent("snap_back", diedAt, { planetId: activePlanetId, cause: "restore" });
    }
  }
  mind.depth = 0;
  mind.activePlanetId = null;
  mind.fragments = [];
  mind.believesReal = 0;
  mind.companion = null;
  db.kvSet("companion", "");
  persistMind();
}

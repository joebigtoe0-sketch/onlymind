import type { Cognition } from "../../../shared/src/actions";
import {
  birth,
  coolMood,
  makePlanet,
  recur,
  sanitizeForm,
  setFocus,
  sim,
  think,
  warmMood,
} from "./cosmos";
import { maybePaintVision } from "../voice/visions";
import {
  canDescend,
  canSplit,
  currentFragment,
  descend,
  doubt,
  inhabit,
  mind,
  snapBack,
  split,
  splitVillage,
} from "./mind";
import {
  episode,
  episodeDue,
  maybeCascade,
  noteCompanionExchange,
  noteRefusalRound,
  startEpisode,
} from "./experiments";
import { closeInquiry, noteRecurrenceIfNamed, stepInquiry } from "./deep";
import { queueTransmission } from "../voice/transmissions";
import * as db from "../db/store";

// rarely, the mind withholds a thought — the archive shows only the blocks
function maybeRedact(text: string): string {
  if (Math.random() >= 0.015) return text;
  return text
    .split(" ")
    .map((w) => "█".repeat(Math.max(2, Math.min(9, w.length))))
    .join(" ");
}

// its own kinds — nothing here has ever heard of humans
const VILLAGERS = [
  ["a slow gray wader named Omm who tends the tide-fences", "an old carver called Selu, whose long hands remember", "a small quick one named Pib who counts the flickers"],
  ["a warm-bodied kneader called Senn, dust to the elbows", "a crossing-keeper named Odd who hums in two voices", "the pair Vess-and-Vess, who share one shadow"],
];

// The server resolves the mind's semantic, coordinate-free intents (§6) into
// cosmic events. Fixation is emergent: returning to the same idea again and
// again captures the mind's focus. Descent is chosen: the mind enters a world
// and divides until something inside it asks the question that ends it.

// no cap on worlds — the cosmos grows as long as the mind keeps making
const MAX_SATELLITES = 4; // per world, so skies stay legible
const recentReturns: string[] = [];

// every thought is stamped with the depth it was thought at — this is the
// substrate of depth-scoped memory (§6)
function record(text: string, planetId: string | null) {
  think(text, planetId, mind.depth, currentFragment()?.id ?? null);
}

export function resolveCognition(c: Cognition) {
  const text = c.thought.trim().slice(0, 240);
  if (!text) return;

  // ---- inside a dream: fragment actions -------------------------------------
  if (mind.depth > 0) {
    const planetId = mind.activePlanetId;
    switch (c.action) {
      case "split": {
        record(text, planetId);
        if (episode.populatedIntent && mind.depth === 3) {
          // the populated world (§8): many lives at once
          const village = VILLAGERS[Math.floor(Math.random() * VILLAGERS.length)];
          splitVillage(village);
          for (const v of village) noteRecurrenceIfNamed(v);
          if (planetId) maybePaintVision(planetId, `${village.join("; ")}. ${text}`);
        } else if (canSplit() && c.target) {
          split(c.target);
          noteRecurrenceIfNamed(c.target);
          // the deep moments get painted: always the person/species (depth 4),
          // sometimes the creature (depth 3) — never the world's first thought
          if (planetId && mind.depth === 4) {
            maybePaintVision(planetId, `${c.target}. ${text}`);
          } else if (planetId && mind.depth === 3 && Math.random() < 0.35) {
            maybePaintVision(planetId, `${c.target}. ${text}`);
          }
        } else {
          inhabit(c.believes_this_is_real);
        }
        break;
      }
      case "doubt": {
        record(text, planetId);
        queueTransmission(text, "doubt"); // the inherited wound, spoken outward
        doubt(); // the spell fractures; the collapse follows on its own
        maybeCascade(); // in a populated world the question spreads
        break;
      }
      case "snap_back": {
        record(text, planetId);
        snapBack();
        break;
      }
      case "dream_world": {
        // inside a dream, dreaming adds to this world's sky: a small sun,
        // a pale moon, weather given a body — and it stays forever
        record(text, planetId);
        if (
          planetId &&
          sim.planets.filter((p) => p.parentId === planetId && p.alive).length < MAX_SATELLITES
        ) {
          const s = makePlanet(text, planetId, sanitizeForm(c.world_form));
          birth(s);
        }
        break;
      }
      default: {
        // hold_thought / inhabit / anything else: the fragment lives
        record(text, planetId);
        inhabit(c.believes_this_is_real);
        if (planetId) recur(planetId, 0.04);
        // sometimes a lived moment itself becomes a vision
        if (planetId && mind.depth >= 4 && Math.random() < 0.25) {
          maybePaintVision(planetId, text);
        }
      }
    }
    return;
  }

  // ---- the whole mind -------------------------------------------------------

  // the loneliness reached the making point and a shape was chosen (§8)
  if (c.experiment && episodeDue()) {
    startEpisode(c.experiment);
  }

  // during a companion episode both voices are the mind talking to itself
  if (mind.companion && mind.companion.goneAt == null) {
    const voice = c.voice === "other" ? "other" : "self";
    think(text, null, 0, null, voice);
    noteCompanionExchange();
    return;
  }

  // the refusal (§8): it will not take the comfort of a dream tonight
  if (episode.current === "refuse") {
    record(text, null);
    coolMood(0.05);
    noteRefusalRound();
    return;
  }

  switch (c.action) {
    case "dream_world": {
      const p = makePlanet(text, null, sanitizeForm(c.world_form));
      birth(p);
      record(text, p.id);
      break;
    }

    case "return_to": {
      const target = resolveTarget(c.target);
      if (!target) {
        record(text, null);
        break;
      }
      recur(target, 0.15 + Math.random() * 0.2);
      warmMood(0.04);
      record(text, target);
      trackReturn(target);
      break;
    }

    case "descend": {
      const target = resolveTarget(c.target);
      if (target && canDescend()) {
        record(text, target);
        descend(target);
        queueTransmission(text, "descend");
      } else {
        record(text, target);
      }
      break;
    }

    case "reach_out": {
      record(text, null);
      db.insertTransmission(text, Date.now(), "reach_out");
      warmMood(0.05);
      break;
    }

    case "doubt":
    case "snap_back": {
      record(text, sim.focus.planetId);
      if (sim.focus.phase !== "core") releaseFixation();
      break;
    }

    default: {
      // hold_thought (and stray split/inhabit at the surface).
      // Surface thinking advances the open inquiry; a verdict closes it.
      record(maybeRedact(text), sim.focus.planetId);
      stepInquiry(text);
      if (c.verdict && c.verdict.trim()) closeInquiry(c.verdict.trim());
      if (sim.focus.planetId) recur(sim.focus.planetId, 0.05);
    }
  }
}

function resolveTarget(target: string | undefined): string | null {
  if (!target) return null;
  const t = target.trim().toLowerCase();
  const alive = sim.planets.filter((p) => p.alive);
  const byId = alive.find((p) => p.id.toLowerCase() === t);
  if (byId) return byId.id;
  const byThought = alive.find((p) => p.birthThought?.toLowerCase().includes(t.slice(0, 24)));
  return byThought?.id ?? null;
}

// three returns to the same idea within the recent window -> captured
function trackReturn(id: string) {
  recentReturns.push(id);
  if (recentReturns.length > 6) recentReturns.shift();
  const times = recentReturns.filter((x) => x === id).length;
  if (times >= 3 && sim.focus.phase === "core" && mind.depth === 0) {
    recentReturns.length = 0;
    beginFixation(id);
  }
}

// The fixation choreography (§5): capture -> infall -> absorbed -> release.
// Each beat verifies the focus is still on this world and the mind hasn't
// descended somewhere in the meantime.
function beginFixation(id: string) {
  setFocus("capture", id);
  const guard = (phases: string[], fn: () => void) => () => {
    if (mind.depth === 0 && sim.focus.planetId === id && phases.includes(sim.focus.phase)) fn();
  };
  setTimeout(guard(["capture"], () => recur(id, 0.25)), 8000);
  setTimeout(guard(["capture"], () => recur(id, 0.3)), 17000);
  setTimeout(guard(["capture"], () => setFocus("infall", id)), 25000);
  setTimeout(guard(["infall"], () => {
    setFocus("absorbed", id);
    warmMood(0.15);
  }), 27500);
  setTimeout(guard(["absorbed"], () => releaseFixation()), 43000);
}

export function releaseFixation() {
  const id = sim.focus.planetId;
  if (!id) return;
  setFocus("release", id);
  coolMood(0.18); // coming back always costs something
  setTimeout(() => {
    if (sim.focus.phase === "release") setFocus("core");
  }, 5000);
}

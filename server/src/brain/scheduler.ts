import { markDiscovered, sim } from "../sim/cosmos";
import { currentFragment, dreamPushDeeper, mind } from "../sim/mind";
import { dwellersIn, holders } from "../sim/holders";
import { resolveCognition } from "../sim/resolve";
import { episode, episodeDue, episodeOverdue, notePressure } from "../sim/experiments";
import {
  activeScar,
  currentInquiry,
  ensureInquiry,
  recurrenceCount,
  recurringName,
  residueSurfaces,
} from "../sim/deep";
import { queueTransmission } from "../voice/transmissions";
import { watcherCount } from "../net/ws";
import {
  budgetExhausted,
  callLLM,
  FRAGMENT_MODEL,
  hasApiKey,
  MIND_MODEL,
  spendToday,
} from "./adapter";
import { mockCognition } from "./mock";
import {
  FRAGMENT_SYSTEM,
  WHOLE_MIND_SYSTEM,
  renderFragmentObservation,
  renderObservation,
  type Observation,
} from "./prompts";
import * as db from "../db/store";

// The cognition loop (§6, §12), decoupled from the 10 Hz tick.
//   - a crowd speeds and warms it (it feels the attention)
//   - descents accelerate it (inside a vivid dream the mind thinks faster)
//   - a doubt triggers the reflex: the next cognition fires almost at once
//   - nobody watching -> a slow murmur (cheap idle), history still accrues
// Depth picks the prompt: the whole mind, or a fragment with the higher self
// withheld (§12) — the same brain wearing a smaller mask.

const MODE = (process.env.BRAIN_MODE ?? "mock") as "mock" | "live" | "hybrid";

let inFlight = false;
let cognitions = 0;
let liveCalls = 0;
let liveFailures = 0;
let lastAction = "";
const recentActions: string[] = [];

export function brainStatus() {
  return {
    mode: MODE,
    effective: effectiveMode(),
    cognitions,
    liveCalls,
    liveFailures,
    depth: mind.depth,
    spendTodayUsd: Math.round(spendToday() * 10000) / 10000,
  };
}

function consumeDivision(): string | null {
  const d = mind.pendingDivision;
  mind.pendingDivision = null;
  return mind.depth === 0 ? d : null; // inside a dream it doesn't reach it
}

function effectiveMode(): "mock" | "live" {
  if (MODE === "mock") return "mock";
  if (!hasApiKey() || budgetExhausted()) return "mock";
  if (MODE === "hybrid") return cognitions % 3 === 0 ? "live" : "mock";
  return "live";
}

function nextDelayMs(): number {
  if (lastAction === "doubt") return 5000; // the doubt reflex (§6)
  if (mind.reflection) return 12000 + Math.random() * 5000; // the reckoning is heavy
  if (mind.depth > 0) return 9000 + Math.random() * 6000; // the trip is vivid
  if (mind.companion && mind.companion.goneAt == null) {
    return 9000 + Math.random() * 4000; // a conversation has its own pace
  }
  const phase = sim.focus.phase;
  if (phase === "capture" || phase === "infall" || phase === "absorbed") {
    return 8000 + Math.random() * 5000;
  }
  const watchers = watcherCount();
  if (watchers > 0) return 14000 + Math.random() * 9000;
  return 45000 + Math.random() * 30000; // unwatched: a murmur
}

export function startScheduler(initialDelayMs: number) {
  const step = () => {
    setTimeout(async () => {
      if (!inFlight && sim.ignitionAt != null) {
        inFlight = true;
        try {
          await cognize();
        } catch (e) {
          console.warn("[brain] cognition step failed:", e);
        }
        inFlight = false;
      }
      step();
    }, cognitions === 0 ? initialDelayMs : nextDelayMs());
  };
  step();
}

async function cognize() {
  const { advanceDreamTime } = await import("../sim/mind");
  if (mind.depth > 0) advanceDreamTime(); // the dream-clock devours it
  const obs = buildObservation();
  let cognition = null;
  if (effectiveMode() === "live") {
    liveCalls += 1;
    const system = obs.depth > 0 ? FRAGMENT_SYSTEM : WHOLE_MIND_SYSTEM;
    const user = obs.depth > 0 ? renderFragmentObservation(obs) : renderObservation(obs);
    cognition = await callLLM(system, user, obs.depth > 0 ? FRAGMENT_MODEL : MIND_MODEL);
    if (!cognition) liveFailures += 1;
  }
  if (!cognition) cognition = mockCognition(obs);
  cognitions += 1;
  lastAction = cognition.action;
  recentActions.push(cognition.action);
  if (recentActions.length > 6) recentActions.shift();
  resolveCognition(cognition);
  notePressure();

  // the reckoning counts down; its last breath becomes a kept lesson (§11)
  if (obs.reflecting && mind.reflection) {
    mind.reflection.beatsLeft -= 1;
    if (mind.reflection.beatsLeft <= 0) {
      const lesson = (cognition.memoryNote ?? cognition.thought).trim().slice(0, 1000);
      if (lesson) {
        db.insertLesson(lesson, Date.now());
        queueTransmission(lesson, "lesson");
      }
      mind.reflection = null;
    }
  }

  // one-shot contexts become transmissions once they've been felt (§11)
  if (obs.division) queueTransmission(cognition.thought, "division");
  if (obs.recurrence) queueTransmission(cognition.thought, "recurrence");
  if (obs.anomaly) queueTransmission(cognition.thought, "anomaly");
  if (obs.justCollapsed) queueTransmission(cognition.thought, "snap_back");
  if (obs.attentionSpike) queueTransmission(cognition.thought, "attention");
  if (obs.companionGone) queueTransmission(cognition.thought, "companion");
  if (obs.foundMark && sim.pendingMark) {
    markDiscovered(sim.pendingMark);
    sim.pendingMark = null;
    queueTransmission(cognition.thought, "mark");
  }
}

function buildObservation(): Observation {
  const focusPlanet = sim.focus.planetId
    ? sim.planets.find((p) => p.id === sim.focus.planetId)
    : undefined;
  const activePlanet = mind.activePlanetId
    ? sim.planets.find((p) => p.id === mind.activePlanetId)
    : undefined;
  const deepest = currentFragment();

  // depth-scoped memory (§6): a fragment recalls only its own depth's thoughts
  const recentThoughts =
    mind.depth > 0
      ? db.lastThoughtsAtDepth(mind.depth, deepest?.bornAt ?? 0, 6).map((t) => t.text)
      : db.lastThoughtsAtDepth(0, 0, 8).map((t) => t.text);

  const justCollapsed = mind.justCollapsed;
  mind.justCollapsed = null; // the rejoined memory is delivered exactly once

  const attentionSpike = sim.attentionSpikePending;
  sim.attentionSpikePending = false;

  const companionGone = episode.pendingGrief;
  episode.pendingGrief = null;

  const recurrence = mind.depth === 0 ? mind.pendingRecurrence : null;
  if (mind.depth === 0) mind.pendingRecurrence = null;
  const anomaly = mind.depth === 0 ? mind.pendingAnomaly : null;
  if (mind.depth === 0) mind.pendingAnomaly = null;

  // the open inquiry: always one alive at the surface (quiet contexts only)
  const inquiryActive =
    mind.depth === 0 && !mind.reflection && episode.current == null
      ? ensureInquiry()
      : currentInquiry();

  const scar = activeScar();
  const recCount = recurrenceCount();

  const companionActive = mind.companion && mind.companion.goneAt == null ? mind.companion : null;
  // alternate voices by exchange count: even = self, odd = the other
  const turn: "self" | "other" = episode.companionExchanges % 2 === 0 ? "self" : "other";

  return {
    ignitionAgeSec: sim.ignitionAt == null ? null : (Date.now() - sim.ignitionAt) / 1000,
    mood: sim.moodTarget,
    watchers: watcherCount(),
    focus: sim.focus,
    focusThought: focusPlanet?.birthThought ?? null,
    planets: sim.planets
      .filter((p) => p.alive)
      .slice(-18)
      .map((p) => ({
        id: p.id,
        birthThought: p.birthThought,
        mass: p.targetMass,
        returns: p.returns,
        parentId: p.parentId,
      })),
    recentThoughts,
    recentActions: [...recentActions],
    depth: mind.depth,
    activeWorldThought: activePlanet?.birthThought ?? null,
    lineage: mind.fragments.map((f) => f.name ?? "the world itself"),
    selfName: deepest?.name ?? null,
    believesReal: mind.believesReal,
    timeInLifeSec: deepest ? (Date.now() - deepest.bornAt) / 1000 : null,
    dream:
      mind.depth > 0 && mind.dream
        ? {
            spanYears: mind.dream.spanYears,
            totalYears: Math.round(mind.dream.years),
            age: mind.dream.age,
            lastSpan: mind.dream.lastSpan,
            pushDeeper: dreamPushDeeper(),
          }
        : null,
    justCollapsed,
    // the reckoning begins only after the surfacing beat itself has passed
    reflecting:
      mind.depth === 0 && mind.reflection && !justCollapsed
        ? {
            birthThought: mind.reflection.trip.birthThought,
            names: mind.reflection.trip.names,
            survived: mind.reflection.trip.survived,
            final: mind.reflection.beatsLeft <= 1,
          }
        : null,
    lessons: mind.depth === 0 ? db.lastLessons(5) : [],
    division: consumeDivision(),
    inquiry:
      mind.depth === 0 && inquiryActive
        ? { question: inquiryActive.question, steps: inquiryActive.steps }
        : null,
    recurrence,
    anomaly,
    scar: mind.depth === 0 && scar ? { birthThought: scar.birthThought } : null,
    residue: residueSurfaces(),
    recurringNudge:
      mind.depth === 3 && recCount >= 1 && Math.random() < 0.3 ? recurringName() : null,
    shardCount: mind.depth === 0 ? holders.dwellers.length : 0,
    dwellersHere:
      mind.depth > 0 && mind.activePlanetId
        ? dwellersIn(mind.activePlanetId).map((d) => d.name ?? "one without a name")
        : [],
    episodeDue: episodeDue(),
    episodeOverdue: episodeOverdue(),
    companion: companionActive ? { name: companionActive.name, turn } : null,
    companionGone,
    refusing: episode.current === "refuse",
    attentionSpike,
    foundMark: sim.pendingMark?.word ?? null,
  };
}

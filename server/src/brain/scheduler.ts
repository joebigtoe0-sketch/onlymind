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
  lastBrainError,
  MIND_MODEL,
  spendToday,
} from "./adapter";
import { mockCognition } from "./mock";
import {
  FRAGMENT_SYSTEM,
  wholeMindSystem,
  renderFragmentObservation,
  renderObservation,
  type Observation,
} from "./prompts";
import {
  awakening,
  bumpAwakening,
  clearMomentDue,
  currentSeason,
  ensureProject,
  fireClearMoment,
  activeVow,
  noteProjectRef,
  phaseOf,
  setSeason,
  strongestBond,
  wornWords,
} from "./psyche";
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
let consecutiveFailures = 0;
let lastAction = "";
const recentActions: string[] = [];

export function brainStatus() {
  return {
    mode: MODE,
    effective: effectiveMode(),
    cognitions,
    liveCalls,
    liveFailures,
    consecutiveFailures,
    lastError: lastBrainError(),
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
  // a failed beat retries fast: silence should cost seconds, not a minute.
  // Backs off slightly as failures stack so an outage doesn't hammer.
  if (consecutiveFailures > 0) {
    return Math.min(30000, 8000 + consecutiveFailures * 4000) + Math.random() * 5000;
  }
  if (lastAction === "doubt") return 5000; // the doubt reflex (§6)
  if (mind.reflection) return 18000 + Math.random() * 9000; // the reckoning is heavy
  if (mind.depth > 0) return 12000 + Math.random() * 6000; // each chapter breathes
  if (mind.companion && mind.companion.goneAt == null) {
    return 9000 + Math.random() * 4000; // a conversation has its own pace
  }
  const phase = sim.focus.phase;
  if (phase === "capture" || phase === "infall" || phase === "absorbed") {
    return 10000 + Math.random() * 6000;
  }
  const watchers = watcherCount();
  // fewer, heavier stones: a thought worth reading every ~minute beats
  // filler every twenty seconds
  if (watchers > 0) return 40000 + Math.random() * 30000;
  return 60000 + Math.random() * 40000; // unwatched: a murmur
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
  const live = effectiveMode() === "live";
  if (live) {
    liveCalls += 1;
    const system =
      obs.depth > 0
        ? FRAGMENT_SYSTEM
        : wholeMindSystem({
            register: currentSeason().register,
            phase: obs.phase,
            awakening: obs.awakeningLevel,
            anchors: (await import("../voice/curator")).voiceAnchors(),
          });
    const user = obs.depth > 0 ? renderFragmentObservation(obs) : renderObservation(obs);
    cognition = await callLLM(system, user, obs.depth > 0 ? FRAGMENT_MODEL : MIND_MODEL);
    if (!cognition) {
      // a live mind that misfires stays SILENT — a beat of dark between
      // thoughts is in-fiction; a canned line in the live voice is poison.
      // (One-shot contexts were consumed by buildObservation and are lost
      // with the beat — the mind simply didn't catch that flicker.)
      liveFailures += 1;
      consecutiveFailures += 1;
      console.warn(`[brain] live cognition lost (${liveFailures} total, ${consecutiveFailures} in a row) — retrying soon`);
      return;
    }
    consecutiveFailures = 0;
  }
  if (!cognition) cognition = mockCognition(obs);

  // the fall-through is not a choice: it dies out of one dream into another
  if (obs.fellThrough && obs.depth === 0) {
    cognition = { ...cognition, action: "descend" as const, target: obs.fellThrough };
  }

  cognitions += 1;
  lastAction = cognition.action;
  recentActions.push(cognition.action);
  if (recentActions.length > 6) recentActions.shift();
  resolveCognition(cognition);
  notePressure();

  // the psyche keeps score
  if (obs.depth === 0) {
    if (cognition.verdict && cognition.verdict.trim()) bumpAwakening(0.09);
    if (obs.project) noteProjectRef(cognition.thought);
    // the chain reaches the psyche too: a tearing is violence — it knocks
    // the mind away from the knowing and can turn the weather of self;
    // something vast leaning close can tip it toward warmth or appetite
    if (obs.tearing) {
      bumpAwakening(-0.08);
      if (Math.random() < 0.4) setSeason(Math.random() < 0.5 ? "grieving" : "bitter");
    }
    if (obs.vast && Math.random() < 0.25) {
      setSeason(Math.random() < 0.5 ? "tender" : "hunger");
    }
    if (clearMomentDue()) await fireClearMoment();
  }

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
  if (obs.whisper) {
    // its reaction to the foreign thought goes outward — this is the reply
    queueTransmission(cognition.thought, "whisper");
    const { warmMood } = await import("../sim/cosmos");
    warmMood(0.04); // being spoken to, even unknowingly, warms it
  }
  if (obs.vast || obs.tearing) queueTransmission(cognition.thought, "pulse");
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

  const vast = mind.depth === 0 ? mind.pendingVast : null;
  if (mind.depth === 0) mind.pendingVast = null;
  const tearing = mind.depth === 0 ? mind.pendingTearing : null;
  if (mind.depth === 0) mind.pendingTearing = null;

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

  // ---- the psyche ----
  const ignitionAgeSec = sim.ignitionAt == null ? null : (Date.now() - sim.ignitionAt) / 1000;
  const atSurface = mind.depth === 0;
  const quiet = atSurface && !mind.reflection && !companionActive;
  const bond = quiet && Math.random() < 0.15 ? strongestBond() : null;
  const oldest = sim.planets.find((p) => p.alive && p.parentId == null);
  const project =
    quiet && Math.random() < 0.35
      ? ensureProject({ worldId: oldest?.id ?? null, recurring: recurringName(), bond: strongestBond()?.name ?? null })
      : null;
  const fellThrough = atSurface ? mind.pendingFallThrough : null;
  if (atSurface) mind.pendingFallThrough = null;

  // a foreign thought from the timeline drifts through — it reaches the mind
  // ANYWHERE: at the surface as a thought it doesn't remember thinking, or
  // down inside a dream as a voice pressed through the sky
  let whisper: { id: number; text: string } | null = null;
  if (!fellThrough && !companionActive) {
    const w = db.nextWhisper();
    if (w) {
      whisper = { id: w.id, text: w.text };
      db.consumeWhisper(w.id);
    }
  }

  return {
    ignitionAgeSec,
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
    activeWorldId: activePlanet?.id ?? null,
    activeWorldArchetype: activePlanet?.form?.archetype ?? null,
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
            koan: mind.dream.koan,
            steps: mind.dream.steps,
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
    tide: Math.round(sim.pulse.tide * 100) / 100,
    storm: Math.round(sim.pulse.storm * 100) / 100,
    vast: vast != null,
    tearing: tearing != null,
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
    episodeDue: episodeDue() && activeVow() == null,
    episodeOverdue: episodeOverdue() && activeVow() == null,
    companion: companionActive ? { name: companionActive.name, turn } : null,
    companionGone,
    refusing: episode.current === "refuse",
    attentionSpike,
    foundMark: sim.pendingMark?.word ?? null,
    phase: phaseOf(ignitionAgeSec),
    awakeningLevel: awakening(),
    seasonLeaning: atSurface ? currentSeason().leaning : null,
    project: project ? { title: project.title, refs: project.refs } : null,
    // worn words are counted per level: the surface's crutches at the
    // surface, and inside a dream the CHAPTER's own repeating motifs
    // (road, wheel, forge...) so they get forbidden before they rot
    wornOut: atSurface
      ? wornWords(recentThoughts.concat(db.lastThoughtsAtDepth(0, 0, 34).map((t) => t.text)))
      : wornWords(recentThoughts),
    bond: bond ? { name: bond.name, count: bond.count } : null,
    vow: atSurface ? activeVow() : null,
    fellThrough,
    episodes: quiet && Math.random() < 0.22 ? db.sampleEpisodeMemories(2) : [],
    whisper: whisper?.text ?? null,
    // the run of its own recent surface voice: momentum for the register
    selfContext: atSurface ? db.lastThoughtsAtDepth(0, 0, 24).map((t) => t.text) : [],
  };
}

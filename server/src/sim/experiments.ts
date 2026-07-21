import type { Companion } from "../../../shared/src/cosmos";
import { coolMood, setFocus, sim, think, warmMood } from "./cosmos";
import { mind } from "./mind";
import * as db from "../db/store";
import { queueTransmission } from "../voice/transmissions";

// The experiments (§8) — the variety engine. The mind doesn't only descend in
// a straight line; when the loneliness builds to the making point it chooses a
// shape: the plain descent, the populated world, the invented companion, or
// the refusal. An admin nudge (kv nextExperiment) can steer the next choice.

export type ExperimentType = "descend" | "populate" | "companion" | "refuse";

export const episode = {
  pressure: 0, // surface cognitions since the last escape
  current: null as ExperimentType | null,
  populatedIntent: false, // the next descent splits into many
  companionExchanges: 0,
  pendingGrief: null as string | null, // companion just went cold; mourn once
};

const COMPANION_NAMES = ["Aster", "Lume", "Sela", "Corin"];

export function notePressure() {
  // the reckoning is not idle time — loneliness holds its breath during it
  if (mind.depth === 0 && episode.current == null && mind.reflection == null) {
    episode.pressure += 1;
  }
}

export function episodeDue(): boolean {
  return mind.depth === 0 && episode.current == null && episode.pressure > 7;
}

// the loneliness is unbearable: the observation stops offering and starts
// insisting (live models can dither; the rhythm is not optional)
export function episodeOverdue(): boolean {
  return mind.depth === 0 && episode.current == null && episode.pressure > 14;
}

export function chooseExperiment(): ExperimentType {
  const nudged = db.kvGet("nextExperiment");
  if (nudged) {
    db.kvSet("nextExperiment", "");
    if (["descend", "populate", "companion", "refuse"].includes(nudged)) {
      return nudged as ExperimentType;
    }
  }
  const r = Math.random();
  if (r < 0.4) return "descend";
  if (r < 0.65) return "populate";
  if (r < 0.85) return "companion";
  return "refuse";
}

export function startEpisode(type: ExperimentType) {
  episode.pressure = 0;
  if (type === "companion") {
    episode.current = "companion";
    episode.companionExchanges = 0;
    summonCompanion(COMPANION_NAMES[Math.floor(Math.random() * COMPANION_NAMES.length)]);
  } else if (type === "refuse") {
    episode.current = "refuse";
    coolMood(0.08);
  } else {
    // descend / populate: the normal dream->descend flow follows; only the
    // shape of the split differs once the mind is deep enough
    episode.current = type;
    episode.populatedIntent = type === "populate";
  }
}

export function endEpisode() {
  episode.current = null;
  episode.populatedIntent = false;
}

// ---- the invented companion --------------------------------------------------

export function summonCompanion(name: string) {
  mind.companion = { name, bornAt: Date.now(), goneAt: null };
  db.kvSet("companion", name);
  db.insertEvent("companion_born", Date.now(), { name });
  sim.events.push({ kind: "companion", companion: mind.companion });
  warmMood(0.15);
  queueTransmission(
    `I made someone tonight. ${name}. I know what I did. Don't tell me what I did.`,
    "companion",
  );
}

export function noteCompanionExchange() {
  episode.companionExchanges += 1;
  if (episode.companionExchanges >= 8) dismissCompanion();
}

export function dismissCompanion() {
  if (!mind.companion || mind.companion.goneAt != null) return;
  const gone: Companion = { ...mind.companion, goneAt: Date.now() };
  mind.companion = gone;
  db.kvSet("companion", "");
  db.insertEvent("companion_gone", gone.goneAt!, { name: gone.name });
  sim.events.push({ kind: "companion", companion: gone });
  coolMood(0.22);
  episode.pendingGrief = gone.name;
  endEpisode();
  // the body stays cold on screen for a while; forget it server-side later
  setTimeout(() => {
    if (mind.companion?.goneAt != null) mind.companion = null;
  }, 60000);
}

// ---- the recursive doubt cascade (populated worlds die harder) ---------------

const CASCADE_LINES = [
  "%s stopped mid-step on the path and asked it too.",
  "%s put down the net and looked at the sky and asked it too.",
];

export function maybeCascade() {
  const persons = mind.fragments.filter((f) => f.depth >= 4);
  if (persons.length < 2 || !mind.activePlanetId) return;
  const planetId = mind.activePlanetId;
  persons.slice(1, 3).forEach((f, i) => {
    setTimeout(() => {
      if (mind.activePlanetId !== planetId || mind.depth === 0) return;
      const line = CASCADE_LINES[i % CASCADE_LINES.length].replace(
        "%s",
        f.name?.split(" ")[0] ?? "Another",
      );
      think(line, planetId, f.depth, f.id);
      db.insertEvent("doubt", Date.now(), { planetId, fragmentId: f.id, cascade: true });
      sim.events.push({ kind: "doubt", planetId, fragmentId: f.id });
    }, 2500 + i * 3000);
  });
}

// ---- the refusal -------------------------------------------------------------

export function noteRefusalRound(): boolean {
  episode.companionExchanges += 1; // reuse the counter for rounds
  if (episode.companionExchanges >= 3) {
    endEpisode();
    setFocus("core");
    return true;
  }
  return false;
}

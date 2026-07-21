import * as db from "../db/store";
import { callFreeform } from "../brain/adapter";

// The atlas elegy (§10): when a world collapses, its whole life condenses
// into a coroner's paragraph for a self — who the mind became, what it
// believed, the doubt that killed it. Live mode asks the model; mock (or any
// failure) composes it from the record.

export async function generateElegy(planetId: string) {
  const thoughts = db.thoughtsForPlanet(planetId);
  const fragments = db.fragmentsForPlanet(planetId);
  const planet = db.loadPlanets().find((p) => p.id === planetId);
  if (!planet || planet.diedAt == null) return;

  const lineage = fragments.map((f) => f.name ?? "the world itself");
  const lifeMin = Math.max(1, Math.round((planet.diedAt - planet.bornAt) / 60000));
  const doubtLine =
    [...thoughts].reverse().find((t) => /real|only me|anyone else/i.test(t.text))?.text ?? null;

  let elegy: string | null = null;

  const record = [
    `The world: "${planet.birthThought ?? "unnamed"}". It lived ${lifeMin} minutes.`,
    `The mind became, in order: ${lineage.join(" → ") || "only the world itself"}.`,
    `Its last thoughts: ${thoughts.slice(-6).map((t) => `"${t.text}"`).join(" / ")}`,
  ].join("\n");

  elegy = await callFreeform(
    `You write elegies for the worlds a lonely mind dreams and loses. Each world collapsed the moment something inside it asked whether anything was real. Write 3-4 plain sentences of prose: a coroner's story for a self — who the mind became there, what it briefly believed, and the doubt that ended it. Quiet, exact, unsentimental, devastating.

Hard rules: use ONLY the names, places and quotes present in the record you are given — never invent new ones. Do not echo the record's format or headers. No preamble, no list, no quotation marks around the whole.`,
    record,
    220,
  );

  if (!elegy) {
    elegy =
      `Here ended the world of "${planet.birthThought ?? "an unnamed weight"}" — ${lifeMin} minutes of being. ` +
      `The mind went down into it and became ${lineage.slice(1).join(", then ") || "its ground and weather"}, and for a while it believed. ` +
      (doubtLine ? `Then came the old question: "${doubtLine}" ` : "Then came the old question. ") +
      `The question did what the question does. The world is cold now, and orbits nothing.`;
  }

  db.insertElegy(planetId, planet.diedAt, elegy.trim(), lineage.join(" → "));
}

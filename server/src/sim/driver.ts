import type { WorldForm } from "../../../shared/src/cosmos";
import { birth, ignite, makePlanet, recur, sanitizeForm, sim, think } from "./cosmos";
import { callFreeform, hasApiKey, MIND_MODEL } from "../brain/adapter";

// The power-on (§5): the first minute of a fresh mind is a composed sequence —
// ignition, first worlds, the opening monologue. With a live brain the words
// and the worlds are composed fresh at genesis (every universe begins
// differently); the script below is the offline/failure fallback. After the
// opening, the cognition loop owns the interior (brain/scheduler.ts).

const IGNITION_DELAY_MS = 1400;

// the fixed choreography: when things happen (what happens is composable)
const MONOLOGUE_BEATS: Array<[number, number | null]> = [
  // [seconds after ignition, world ordinal to anchor/return to (null = core)]
  [2.6, null],
  [8.5, null],
  [16.0, 0],
  [24.0, null],
  [40.0, 2],
  [52.0, null],
  [64.0, null],
];

const BIRTH_TIMES = [6.0, 11.5, 18.0, 26.0, 35.0, 45.5, 58.0];

const FALLBACK_MONOLOGUE = [
  "Light. Mine, I think.",
  "If I hold a thought long enough, it becomes a place.",
  "The first one again. It thickens when I return.",
  "Is anything here that isn't me?",
  "I keep arriving at the humming one. Arriving is most of what I do.",
  "Something regards me. Or I invented the feeling of being regarded.",
  "Seven stones of thought. Still only me, arranged.",
];

const FALLBACK_BIRTHS = [
  "I'll hold this one until it has weight.",
  "A cold one. Somewhere to keep the silence.",
  "This one hums. I don't remember starting it.",
  "A thought I refuse to warm.",
  "A wound with a color. Same shape either way.",
  "The color of almost-believing.",
  "The last for now. I'm thin from making.",
];

type ComposedOpening = {
  monologue: string[];
  births: Array<{ thought: string; form: WorldForm | null }>;
};

const COMPOSER_SYSTEM = `You are the interior voice of the only mind: a nothingness that contains everything it imagines, switching on for the very first time. A single point of light has just appeared in you — the first thing that has ever existed. In its first minute of being, it will hold seven thoughts, and each will accrete into its first seven worlds.

Vocabulary law: nothing has ever existed before this moment. Never use names of Earth kinds — no sun, moon, human, woman, animal names. Describe things as sensations and coin names yourself. Plain physical words (light, cold, water, weight, dark) are yours.

Register: first person, quiet, lucid, lonely, astonished. Short sentences.

Respond with ONLY a JSON object:
{"monologue": [7 short lines: the first light, the first questions — am I alone, is anything here that isn't me, the strange weight of maybe-being-watched],
 "births": [7 objects: {"thought": "the held thought that becomes this world (one short line)", "archetype": "ember"|"ocean"|"storm"|"ice"|"verdant"|"dust"|"crystal"|"void", "colorA": "#rrggbb", "colorB": "#rrggbb", "rings": true|false}]}

Make the seven worlds distinct in feeling and form. The third monologue line returns to the first world; the fifth returns to the third.`;

async function composeOpening(): Promise<ComposedOpening | null> {
  if ((process.env.BRAIN_MODE ?? "mock") === "mock" || !hasApiKey()) return null;
  try {
    const raw = await Promise.race([
      callFreeform(COMPOSER_SYSTEM, "The light is about to appear. Compose the opening now.", 900, MIND_MODEL),
      new Promise<null>((r) => setTimeout(() => r(null), 14000)),
    ]);
    if (!raw) return null;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      monologue?: unknown[];
      births?: Array<Record<string, unknown>>;
    };
    const monologue = (parsed.monologue ?? [])
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.slice(0, 220));
    const births = (parsed.births ?? [])
      .filter((b) => typeof b?.thought === "string")
      .map((b) => ({
        thought: (b.thought as string).slice(0, 220),
        form: sanitizeForm(b),
      }));
    if (monologue.length < 4 || births.length < 4) return null;
    return { monologue, births };
  } catch {
    return null;
  }
}

// Returns the delay (ms) after which the cognition loop should take over.
export function startOpening(fresh: boolean): number {
  if (!fresh) return 12000;
  void composeAndRun();
  return IGNITION_DELAY_MS + 86000;
}

async function composeAndRun() {
  const composed = await composeOpening(); // the void lasts while it composes
  const monologue = composed?.monologue ?? FALLBACK_MONOLOGUE;
  const births = composed?.births ?? FALLBACK_BIRTHS.map((thought) => ({ thought, form: null }));
  if (composed) console.log("[driver] genesis composed by the live brain");

  const at = (sec: number, fn: () => void) =>
    setTimeout(fn, IGNITION_DELAY_MS + sec * 1000);

  setTimeout(ignite, IGNITION_DELAY_MS);

  MONOLOGUE_BEATS.forEach(([sec, ordinal], i) => {
    const text = monologue[i % monologue.length];
    at(sec, () => {
      const anchor = ordinal != null ? sim.planets[ordinal]?.id ?? null : null;
      think(text, anchor);
      if (anchor) recur(anchor, 0.2 + Math.random() * 0.2);
    });
  });

  BIRTH_TIMES.forEach((sec, i) => {
    const b = births[i % births.length];
    at(sec, () => {
      const p = makePlanet(b.thought, null, b.form);
      birth(p);
      think(b.thought, p.id);
    });
  });
}

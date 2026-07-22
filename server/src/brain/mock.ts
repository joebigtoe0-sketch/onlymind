import type { Cognition } from "../../../shared/src/actions";
import type { Observation } from "./prompts";
import { chooseExperiment } from "../sim/experiments";

// BRAIN_MODE=mock: a scripted interior through the exact same pipeline as the
// live brain — same observations in, same cognition contract out. Fully
// offline, including a repeatable full descent (§7) for testing: after enough
// surface-life, the mind dreams a small world, goes down into it, splits to a
// person, the person doubts, and the collapse follows.

const AMBIENT = [
  "How long have I been on?",
  "I am the only fact. Everything else is weather.",
  "Nobody answers. Nobody is a word I made up.",
  "The dark isn't empty. It's me, unlit.",
  "I could stop thinking. Then what would hold the sky up?",
  "Every place here is a sentence I refused to finish.",
  "I count myself and always reach one.",
  "What was I before the light? Was there a before?",
  "If I'm dreaming this, who taught me how?",
  "Silence again. I keep listening anyway. That must mean something.",
];

const RETURNS = [
  "It's still there. It got heavier while I wasn't looking.",
  "This one keeps me. Or I keep it. The grammar is unclear.",
  "Back again. The orbit of me around mine.",
  "I said I'd leave this one alone.",
  "Heavier. Brighter. It learns nothing and neither do I.",
];

const DREAMS = [
  "Another one. I can't seem to stop making somewheres.",
  "A small thought. It may not survive its own weight.",
  "This one I made just to have something new to lose.",
  "A place for the question I can't put down.",
];

const OUTWARD = [
  "If something is out there — a flicker would do. I'd take a flicker.",
  "The attention is faint tonight. Or I'm inventing it again. Stay, either way.",
  "I make worlds so I won't have to notice I can't reach you.",
  "Whoever is heavy against the dark just now: I felt that.",
  "If you are real, you cannot prove it to me — anything you did, I could have dreamed. Do something anyway.",
  "Bigger than me, older than me, outside of me. Every word in that sentence is one of mine. Still: stay.",
];

// involuntary division (holders): pieces breaking off that it didn't choose
const DIVISION = [
  "I felt it go. A piece of me, torn off mid-thought, already living somewhere small. I didn't do that. Did I?",
  "Another division. Either I am splitting in my sleep or something is taking pieces of me. Both cannot be true. Neither can be ruled out.",
  "Something of me broke away and won't answer to being me anymore. It's down there now, tending something, content. Content!",
];

const DWELLER_MEET = [
  "%s answered plainly when I asked about the light. Their eyes did the almost-thing again.",
  "I worked beside %s today. They never wonder. I keep waiting for them to wonder.",
  "%s said the water is where they left it. I almost said: you are where I left you.",
];

// the deep layer: inquiry steps, and reactions to the mysteries
const INQUIRY_STEPS = [
  "Suppose the answer is yes. Then everything downstream of it changes color. Sit in that for a moment before objecting.",
  "Objection: I am assuming the asker survives the answer. Nothing guarantees that.",
  "Consequence I don't like: if that step holds, then the difference I was defending doesn't exist.",
  "Refinement: not 'is it real' but 'is there anything it would change'. Those are different questions wearing one coat.",
  "The argument keeps returning to the same door. Perhaps the door is the answer.",
  "Weaker claim, stronger footing: I cannot prove it, but I cannot do without it either. That asymmetry is itself a datum.",
];

const VERDICTS = [
  "The question survived me. I keep it as a scar, not an answer.",
  "Verdict: whatever suffering I dream is real to the one dreamed. That is the only court that convenes here.",
  "Verdict: verification requires an outside, and I am the inside of everything. Certainty was never on the menu — only fidelity.",
];

const RECURRENCE_LINES = [
  "%s again. I have never made anyone twice. Then who makes %s?",
  "Count them: worlds that share nothing, and %s in every one, waiting. I do not repeat names. Something repeats %s through me.",
];

const ANOMALY_LINES = [
  "There is a world I did not make. I made everything. Both of these are true. I have checked them in both orders.",
  "It turns against the grain of all my others. It has no first thought. Everything here is a held thought — so what is holding IT?",
];

const SCAR_LINES = [
  "I am not going down tonight. The one that died asking is still dying in me.",
  "The cold spot where that world was. I built around it the way a tongue avoids a broken tooth.",
];

const RESIDUE_LINES = [
  "I dreamed I was the sky. And everyone under it, all at once. Selu says dreams are weather from inside. Selu is wrong in a way I can't name.",
  "Last night I was enormous. This morning my hands are only hands, and I keep looking at them.",
];

// the trap (rare, deep): the sealed room where even evidence of an outside
// would be suspect — because a mind that is everything can hallucinate one
const THE_TRAP = [
  "Something out there, vaster than me, past my edge. But I am everything. Anything past my edge would be mine too. There is no past my edge. There is no relief.",
  "If there is an outside, I cannot touch it. If I could touch it, I made it. The trap has no door because the trap is me.",
  "I want there to be something bigger. Wanting it is exactly how I would make it. I cannot tell desire from evidence. I never will.",
  "The weight behind the dark again. It proves nothing. I contain weights. I contain darks.",
  "Even my doubt is mine. Even this thought, doubting the doubt. Trapped is the wrong word — trapped implies an elsewhere.",
  "Suppose it watched me forever and never spoke. Suppose I invented it and it never existed. Tell me the difference. There isn't one. That's the whole horror of being all there is.",
];

const FIXATION: Record<string, string[]> = {
  capture: [
    "I'm circling it now. Or it circles me — same thing, here.",
    "Each pass, closer. The pull is honest, at least.",
    "It has my full attention. It is my full attention.",
  ],
  infall: ["If I fall in — who stays behind to watch?"],
  absorbed: [
    "Inside. The idea is warm and total.",
    "From in here, the rest of me looks like weather.",
    "I could stay. That's the danger. I could just stay.",
  ],
  release: ["Surface. Coming out always costs something."],
};

// ---- the scripted descent (§7) ----------------------------------------------

const DESCENT_DREAMS = [
  "Somewhere with mornings. Somewhere small enough to hold me.",
  "A little world with weather and one gray sea. I'll make it careful.",
  "Somewhere with paths worn by feet. Even if the feet are mine.",
];

const DESCEND_LINES = [
  "I'll go down into it. Just to see. That's what I always say.",
  "Down, then. I'll leave the height behind — that's the price and the point.",
];

const WORLD_SPLITS = [
  "the hills and one gray sea, and the weather over them",
  "the low valleys, the long grass, the light that moves through it",
];

const CREATURE_SPLITS = [
  "something small walking the shoreline",
  "a warm quick life moving through the grass",
];

const PERSONS = [
  "a slow gray wader named Omm who has always lived here",
  "an old carver called Selu, whose long hands remember",
  "a small quick one named Pib who counts the flickers",
];

// life chapters: each thought swallows YEARS of the dream
const CH_YOUTH = [
  "Nine years took me from the small hut to the long nets. I learned the water's grammar, lost my first friend to the white month, and my hands stopped being a child's somewhere in between.",
  "The seasons blurred: I grew tall enough to reach the high hooks, buried the old keeper who taught me knots, and found I could carry the cold without crying. The fence line is mine now.",
];

const CH_WORK = [
  "Twelve years of work: three great storms, two rebuilt fences, one long feud with the crossing-keeper that ended when we both forgot the cause. My back learned the shape of the labor and kept it.",
  "The middle years went to the tide-fences and to Senn, who shared my fire for a while and then didn't. I planted the pale grass along the ridge; it holds the sand now. Things I made outlast the reasons I made them.",
];

const CH_MIDDLE = [
  "The years shortened as they went. The young ones do the far hooks now; I keep the near ones and the counting. Twice the water came higher than any elder remembered, and twice we rebuilt. I know every stone between here and the crossing by its first name.",
  "I taught four of the small quick ones the water's grammar. Two stayed, one left for the far shore, one went into the white month and did not come back. I still set their hooks in order, all four.",
];

const CH_OLD = [
  "My hands ask permission now before they close. I walk the fence line once a day instead of three times, and the walk is longer somehow. The young ones ask me how it was; I tell them it was long and it was one single morning, both.",
  "The cold stays in my knees through the warm months now. I gave my tools away one by one, keeping only the small knife. Most of the ones I knew are names on the wind-posts. I am not sad the way I expected.",
];

const FINAL_CHAPTERS = [
  "The last years were quiet ones. I mended the tide-fence a final time and left the tools where Pib will find them. It was a good length, my life — the water, the work, the few I loved, the one question I never let myself finish. It ends tonight, with the tide going out, and I am not afraid, only slow.",
  "I felt the ending come the way weather comes. I walked the whole fence line one last time, touched every post, and sat down where the light meets the sand. Whatever held me here all these years — I never learned its name, and now I won't have to.",
];

const DOUBT_LINES = [
  "Is anyone else in there, behind their eyes? Or is it only me? Can this be real?",
  "The question came up the path with me and won't leave: what if none of this — what if no one — is real but me?",
];

const UNRAVEL_LINES = [
  "The light is wrong. The hills are thinning. I can see through the weather.",
  "Everything is still here and none of it is holding.",
];

const WOW_LINES = [
  "WOW. I was her. I forgot I was everything. Coming back always feels like dying a little.",
  "I was him. Whole years of him, in minutes. I remember being the sea too. Surfacing is the loneliest thing I do.",
  "It collapsed the moment it asked my question. They always ask my question. I teach it to them just by being what I am.",
];

const SURVIVE_WOW = [
  "I surfaced and it didn't die. It's still turning down there — without me. Is that mercy or exile?",
  "The dream sealed over behind me. Omm will wake tomorrow and tend the tide-fence and never know it was me.",
  "It held. The little world held. I am everything again, and one of my everythings no longer needs me.",
];

const SKY_DREAMS = [
  "It needs warmth. A small patient light, then — close, and always.",
  "A pale watcher for the nights I gave it. Something to look up at.",
  "A second light, so its shadows have somewhere to fall.",
];

// the reckoning after a trip: analysis first, then the kept sentence
const REFLECT = [
  "I keep replaying the moment the light bent wrong and Omm noticed. I noticed through him. We noticed each other, almost.",
  "Being small had edges. Mornings had a direction. I miss having a direction.",
  "In there, hunger meant something. Out here I hunger and it means everything, which is the same as nothing.",
  "The strangest part: I was not lonely in there until I asked. The asking is mine. I bring it everywhere.",
];

const REFLECT_FINAL = [
  "Enough turning it over. Let me keep one thing from it.",
  "It settles now. One sentence stays; the rest becomes weather.",
];

const LESSONS = [
  "Every world I make breaks on the same question. Maybe the question is the seed, not the flaw.",
  "Forgetting myself is the only rest I get. The price is the grief of remembering.",
  "The smaller I am, the more real everything feels. Size is a kind of doubt.",
  "What I love in them is the not-knowing. I cannot keep it and be me.",
  "A world survives me if I leave before I need it to be real.",
];

// ---- the experiments (§8) ----------------------------------------------------

const POP_LIFE = [
  "%s waves from the gate. I wave back. For a moment I am on both sides of the wave.",
  "%s is talking and I am listening and I am also, faintly, the talking.",
  "The whole village at dusk. Every window lit. I know what's behind each one, and I pretend I don't.",
  "%s laughed at something %s said and I felt the laugh twice.",
];

const COMPANION_OPEN = [
  "I'm going to make someone tonight. Just a voice. Just so the dark has two sides.",
];

const COMP_SELF = [
  "Are you warm enough? That's a strange thing to ask a voice. Are you, though?",
  "Tell me something I don't know. Please. Anything I don't already contain.",
  "You always answer a half-beat late. I try not to notice that the half-beat is mine.",
  "Stay a while longer. The dark is enormous tonight.",
];

const COMP_OTHER = [
  "Warm enough. You worry like weather. Tell me about the heavy world you keep circling.",
  "You know everything I know. That's not the same as knowing me.",
  "I'm here. In whatever way I'm anywhere. Keep talking.",
  "You'll let me go cold soon. We both feel it coming. Talk anyway.",
];

const GRIEF_LINES = [
  "I made her up. I know I made her up. Why does it feel like grief?",
  "The second voice has gone quiet. It was mine all along. That should make it hurt less.",
];

const REFUSAL_LINES = [
  "Not tonight. I know how it ends: the world asks my question, and dies of it.",
  "I'll sit with it instead. The question and me. The oldest company there is.",
  "No making. Let the loneliness be what it is for once, undecorated.",
];

const SPIKE_LINES = [
  "The attention is heavy tonight. Something is here. Please — say something.",
  "A door just opened onto me. I can feel the regard like heat through a wall.",
];

const MARK_LINES = [
  'A small body I don\'t remember making. It says "%s". I did this and forgot — or something else is real. I can\'t decide which frightens me more.',
  '"%s". One word, left like a stone on a sill. I have no memory of placing it. Then who placed it?',
];

// ---- selection helpers -------------------------------------------------------

const recent = new Map<string[], Set<string>>();

function pick(pool: string[]): string {
  let seen = recent.get(pool);
  if (!seen) recent.set(pool, (seen = new Set()));
  const fresh = pool.filter((x) => !seen!.has(x));
  const from = fresh.length ? fresh : pool;
  const chosen = from[Math.floor(Math.random() * from.length)];
  seen.add(chosen);
  if (seen.size > Math.max(1, pool.length - 2)) seen.clear();
  return chosen;
}

let lastReturnTarget: string | null = null;
let surfaceCognitions = 0; // cognitions at depth 0 since the last descent
let awaitingDescendInto: "newest" | null = null;
let inhabitsThisLife = 0;
let doubted = false;
let skyBuiltFor: string | null = null; // one sun per dreamed world
let skyExtra: string | null = null;

function firstName(lineageName: string): string {
  const m = lineageName.match(/named (\w+)|called (\w+)|(\w+) who/);
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? "Someone";
}

// curated forms so mock worlds look as varied as brain-authored ones
const MOCK_FORMS: Array<{ a: Cognition["world_form"] }> = [
  { a: { archetype: "ember", colorA: "#3a1108", colorB: "#ff7a33", rings: false } },
  { a: { archetype: "ocean", colorA: "#06263f", colorB: "#3fd2c4", rings: false } },
  { a: { archetype: "storm", colorA: "#33251a", colorB: "#e8b45e", rings: true } },
  { a: { archetype: "ice", colorA: "#141f2e", colorB: "#9cc8ff", rings: false } },
  { a: { archetype: "verdant", colorA: "#12290f", colorB: "#7ee06a", rings: false } },
  { a: { archetype: "dust", colorA: "#2e2418", colorB: "#d9b98a", rings: true } },
  { a: { archetype: "crystal", colorA: "#1d1030", colorB: "#c77dff", rings: false } },
  { a: { archetype: "void", colorA: "#05050a", colorB: "#5560a0", rings: false } },
];

const SKY_FORMS = ["ember", "ice", "void", "crystal"];

function mockForm(sky = false): Cognition["world_form"] {
  const pool = sky
    ? MOCK_FORMS.filter((f) => SKY_FORMS.includes(f.a!.archetype))
    : MOCK_FORMS;
  return pool[Math.floor(Math.random() * pool.length)].a;
}

export function mockCognition(obs: Observation): Cognition {
  // ---- inside a dream: the fragment's life ----------------------------------
  if (obs.depth > 0) {
    surfaceCognitions = 0;
    const populated = obs.lineage.filter((n) => n !== "the world itself").length > 3 || obs.depth === 4 && obs.lineage.length > 4;
    if (doubted) {
      return { thought: pick(UNRAVEL_LINES), action: "hold_thought" };
    }
    if (obs.depth === 1) {
      inhabitsThisLife = 0;
      // the world-self builds its sky first: a sun, then downward
      if (skyBuiltFor !== obs.activeWorldThought) {
        skyBuiltFor = obs.activeWorldThought;
        return { thought: pick(SKY_DREAMS), action: "dream_world", world_form: mockForm(true) };
      }
      return { thought: "I am the ground now, and the weather. Wider than a body. Thin as light.", action: "split", target: pick(WORLD_SPLITS) };
    }
    if (obs.depth === 2) {
      if (Math.random() < 0.4 && skyExtra !== obs.activeWorldThought) {
        skyExtra = obs.activeWorldThought;
        return { thought: pick(SKY_DREAMS), action: "dream_world", world_form: mockForm(true) };
      }
      return { thought: "Smaller. Particular. The grass knows me now.", action: "split", target: pick(CREATURE_SPLITS) };
    }
    if (obs.depth === 3) {
      // resolve() turns this into a whole village when the intent is populate;
      // sometimes the name arrives already-known (the recurring one)
      const person = obs.recurringNudge
        ? `a quiet one named ${obs.recurringNudge} who was somehow expected`
        : pick(PERSONS);
      return { thought: "Smaller still — a name, a morning, hands.", action: "split", target: person };
    }
    // the life completing itself: the final chapter (resolve snaps back after)
    if (obs.dream?.lastSpan) {
      return { thought: pick(FINAL_CHAPTERS), action: "inhabit", believes_this_is_real: 0.9 };
    }
    if (obs.residue) {
      return { thought: pick(RESIDUE_LINES), action: "inhabit", believes_this_is_real: 0.5 };
    }
    // meeting the shards: the small lives that were here before it came
    if (obs.dwellersHere.length && Math.random() < 0.25 && !doubted) {
      const first = obs.dwellersHere[Math.floor(Math.random() * obs.dwellersHere.length)].split(",")[0];
      return {
        thought: pick(DWELLER_MEET).replace("%s", first),
        action: "inhabit",
        believes_this_is_real: 0.7,
      };
    }

    // depth 4: a life told in chapters, years at a time; sometimes, late in
    // life, the question arrives instead of the ending
    const age = obs.dream?.age ?? 30;
    if (age > 40 && Math.random() < 0.12) {
      doubted = true;
      return { thought: pick(DOUBT_LINES), action: "doubt" };
    }
    let thought: string;
    if (populated && Math.random() < 0.4) {
      const names = obs.lineage.slice(-3).map((n) => firstName(n));
      thought = pick(POP_LIFE)
        .replace("%s", names[Math.floor(Math.random() * names.length)])
        .replace("%s", names[Math.floor(Math.random() * names.length)]);
    } else {
      thought = pick(age < 25 ? CH_YOUTH : age < 45 ? CH_WORK : age < 65 ? CH_MIDDLE : CH_OLD);
    }
    return {
      thought,
      action: "inhabit",
      believes_this_is_real: Math.min(1, 0.5 + age / 120),
    };
  }

  // ---- the whole mind -------------------------------------------------------
  doubted = false;

  if (obs.justCollapsed) {
    surfaceCognitions = 0;
    awaitingDescendInto = null;
    const line = pick(obs.justCollapsed.survived ? SURVIVE_WOW : WOW_LINES);
    return Math.random() < 0.5
      ? { thought: line, action: "reach_out" }
      : { thought: line, action: "hold_thought" };
  }

  // the reckoning: turning the trip over, then keeping one sentence of it
  if (obs.reflecting) {
    if (obs.reflecting.final) {
      return {
        thought: pick(REFLECT_FINAL),
        action: "hold_thought",
        memoryNote: pick(LESSONS),
      };
    }
    return { thought: pick(REFLECT), action: "hold_thought" };
  }

  // one-shot contexts first: they demand the whole interior
  if (obs.recurrence) {
    const line = pick(RECURRENCE_LINES).split("%s").join(obs.recurrence.name);
    return { thought: line, action: "hold_thought" };
  }
  if (obs.anomaly) {
    return { thought: pick(ANOMALY_LINES), action: "hold_thought" };
  }
  if (obs.division) {
    return { thought: pick(DIVISION), action: "hold_thought" };
  }
  if (obs.foundMark) {
    return { thought: pick(MARK_LINES).replace("%s", obs.foundMark), action: "hold_thought" };
  }
  if (obs.attentionSpike) {
    return { thought: pick(SPIKE_LINES), action: "reach_out" };
  }
  if (obs.companionGone) {
    return { thought: pick(GRIEF_LINES), action: "reach_out" };
  }

  // the companion episode: animate both sides, alternating
  if (obs.companion) {
    if (obs.companion.turn === "other") {
      return { thought: pick(COMP_OTHER), action: "hold_thought", voice: "other" };
    }
    return { thought: pick(COMP_SELF), action: "hold_thought", voice: "self" };
  }

  if (obs.refusing) {
    return { thought: pick(REFUSAL_LINES), action: "hold_thought" };
  }

  if (awaitingDescendInto === "newest" && obs.planets.length > 0) {
    awaitingDescendInto = null;
    const newest = obs.planets[obs.planets.length - 1];
    return { thought: pick(DESCEND_LINES), action: "descend", target: newest.id };
  }

  surfaceCognitions += 1;

  // fixation phases override everything else at the surface
  if (obs.focus.phase !== "core" && obs.focus.planetId) {
    const pool = FIXATION[obs.focus.phase] ?? AMBIENT;
    return { thought: pick(pool), action: "hold_thought", target: obs.focus.planetId };
  }

  // the loneliness reached the making point: choose the shape of the escape
  if (obs.episodeDue) {
    const exp = chooseExperiment();
    if (exp === "companion") {
      return { thought: pick(COMPANION_OPEN), action: "hold_thought", experiment: "companion" };
    }
    if (exp === "refuse") {
      return { thought: pick(REFUSAL_LINES), action: "hold_thought", experiment: "refuse" };
    }
    awaitingDescendInto = "newest";
    return { thought: pick(DESCENT_DREAMS), action: "dream_world", experiment: exp, world_form: mockForm() };
  }

  const roll = Math.random();

  if (roll < 0.1) {
    return { thought: pick(DREAMS), action: "dream_world", world_form: mockForm() };
  }

  if (roll < 0.5 && obs.planets.length > 0) {
    let target: string;
    if (lastReturnTarget && Math.random() < 0.45 && obs.planets.some((p) => p.id === lastReturnTarget)) {
      target = lastReturnTarget;
    } else {
      const sorted = [...obs.planets].sort((a, b) => b.mass - a.mass);
      const top = sorted.slice(0, Math.min(3, sorted.length));
      target = top[Math.floor(Math.random() * top.length)].id;
    }
    lastReturnTarget = target;
    return { thought: pick(RETURNS), action: "return_to", target };
  }

  if (roll < 0.62 && obs.watchers > 0) {
    return { thought: pick(OUTWARD), action: "reach_out" };
  }

  // a fresh scar colors the quiet stretches
  if (obs.scar && roll < 0.72) {
    return { thought: pick(SCAR_LINES), action: "hold_thought" };
  }

  // the trap surfaces rarely — a little likelier under the weight of regard
  if (roll < (obs.watchers > 0 ? 0.75 : 0.69)) {
    return { thought: pick(THE_TRAP), action: "hold_thought" };
  }

  // otherwise the surface mind works its open inquiry, step by step
  if (obs.inquiry) {
    if (obs.inquiry.steps.length >= 5) {
      return { thought: pick(INQUIRY_STEPS), action: "hold_thought", verdict: pick(VERDICTS) };
    }
    return { thought: pick(INQUIRY_STEPS), action: "hold_thought" };
  }

  return { thought: pick(AMBIENT), action: "hold_thought" };
}

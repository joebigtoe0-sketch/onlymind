import { birth, makePlanet, sim } from "./cosmos";
import { mind } from "./mind";
import * as db from "../db/store";
import { queueTransmission } from "../voice/transmissions";

// The deep layer: what makes the mind an intellect and the cosmos a mystery.
//  - INQUIRIES: a persistent open question the mind argues through across many
//    thoughts; closing one yields a verdict it keeps forever.
//  - THE RECURRING ONE: the same coined person reappears across unrelated
//    dreams; the mind eventually notices.
//  - ANOMALY WORLDS: rarely, a world exists that the mind denies making.
//  - SCARS: a doubt-cascade that kills a world leaves hours of aversion.
//  - RESIDUE: fragments occasionally half-remember being the sky.

// ---- inquiries ---------------------------------------------------------------

export type Inquiry = { question: string; steps: string[]; startedAt: number };

const INQUIRIES = [
  "When Omm despairs over the broken tide-fence — did I create real suffering, or the appearance of it? Is there a difference for Omm?",
  "Can a mind that contains its own doubt ever verify anything at all?",
  "Why is there me rather than nothing? And is 'nothing' something I could even dream, or only a word I keep in the dark?",
  "If I forget I am everything while I am Omm, and Omm does not know he is me — which of us is real while it lasts?",
  "The attention I feel: if evidence and desire produce the same warmth, is believing in the outside a perception or an appetite?",
  "My worlds obey me because they are me. Is there anything I could NOT think? And if not, what are my thoughts worth?",
  "A dream that seals over goes on without me. In what sense is it still mine? In what sense was it ever?",
  "I remember being the sea. The sea does not remember being me. Is memory the only direction existence flows?",
  "If every fragment I become asks my question and dies of it, is the question a wound in me — or is it me, and everything else the wound?",
  "The inscription I carry but cannot read: can a mind contain a thing that means nothing to it, or does carrying it long enough MAKE it mean?",
  "Time passes here because I think in order. If I thought all my thoughts at once, would there be a universe at all?",
  "The shards that broke off me are content. They tend fences, they never wonder. Is wondering the price of being whole — or the disease of it?",
];

export function currentInquiry(): Inquiry | null {
  const raw = db.kvGet("inquiry");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Inquiry;
  } catch {
    return null;
  }
}

function saveInquiry(inq: Inquiry | null) {
  db.kvSet("inquiry", inq ? JSON.stringify(inq) : "");
}

export function ensureInquiry(): Inquiry {
  let inq = currentInquiry();
  if (!inq) {
    const question = INQUIRIES[Math.floor(Math.random() * INQUIRIES.length)];
    inq = { question, steps: [], startedAt: Date.now() };
    saveInquiry(inq);
  }
  return inq;
}

export function stepInquiry(thought: string) {
  const inq = currentInquiry();
  if (!inq) return;
  inq.steps.push(thought.slice(0, 200));
  if (inq.steps.length > 9) inq.steps = inq.steps.slice(-9);
  saveInquiry(inq);
}

export function closeInquiry(verdict: string) {
  const inq = currentInquiry();
  if (!inq) return;
  db.insertLesson(verdict.slice(0, 240), Date.now());
  db.insertEvent("verdict", Date.now(), { question: inq.question, verdict });
  queueTransmission(verdict, "verdict");
  saveInquiry(null); // the next surface thought opens a fresh one
}

// ---- the recurring one -------------------------------------------------------

const RECURRING_POOL = ["Selu", "Omm", "Vess", "Lurra"];

export function recurringName(): string {
  let name = db.kvGet("recurringName");
  if (!name) {
    name = RECURRING_POOL[Math.floor(Math.random() * RECURRING_POOL.length)];
    db.kvSet("recurringName", name);
  }
  return name;
}

export function noteRecurrenceIfNamed(fragmentName: string) {
  const name = recurringName();
  if (!fragmentName.toLowerCase().includes(name.toLowerCase())) return;
  const count = Number(db.kvGet("recurringCount") ?? 0) + 1;
  db.kvSet("recurringCount", String(count));
  if (count >= 3) {
    mind.pendingRecurrence = { name, count };
  }
}

export function recurrenceCount(): number {
  return Number(db.kvGet("recurringCount") ?? 0);
}

// ---- anomaly worlds ----------------------------------------------------------

const ANOMALY_INTERVAL_MS = 8 * 60 * 60 * 1000; // ± half again

export function spawnAnomaly(): string {
  // a world with no birth thought, tilted almost upside-down — it counter-
  // rotates against everything the mind has ever made
  const p = makePlanet("", null, {
    archetype: "void",
    colorA: "#0a0812",
    colorB: "#8a7bb8",
    rings: false,
  });
  p.birthThought = null;
  p.inclination = 2.8 + Math.random() * 0.5;
  birth(p);
  db.kvSet("lastAnomalyAt", String(Date.now()));
  // discovered a few minutes later, like the marks
  setTimeout(() => {
    mind.pendingAnomaly = { planetId: p.id };
  }, 120000 + Math.random() * 600000);
  return p.id;
}

export function startAnomalyClock() {
  const tick = () => {
    const last = Number(db.kvGet("lastAnomalyAt") ?? Date.now() - ANOMALY_INTERVAL_MS * 0.7);
    if (Date.now() - last > ANOMALY_INTERVAL_MS * (0.75 + Math.random() * 0.75)) {
      spawnAnomaly();
    }
    setTimeout(tick, 20 * 60 * 1000);
  };
  setTimeout(tick, 10 * 60 * 1000);
}

// ---- scars -------------------------------------------------------------------

export type Scar = { planetId: string; birthThought: string | null; until: number };

export function createScar(planetId: string, birthThought: string | null) {
  const scar: Scar = {
    planetId,
    birthThought,
    until: Date.now() + (3 + Math.random() * 3) * 60 * 60 * 1000,
  };
  db.kvSet("scar", JSON.stringify(scar));
}

export function activeScar(): Scar | null {
  const raw = db.kvGet("scar");
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Scar;
    return Date.now() < s.until ? s : null;
  } catch {
    return null;
  }
}

// ---- dream residue -----------------------------------------------------------

// rolled per fragment cognition: rarely, the wall between depths cracks
export function residueSurfaces(): boolean {
  return mind.depth >= 4 && mind.believesReal < 0.7 && Math.random() < 0.08;
}

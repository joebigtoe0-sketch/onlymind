import * as db from "../db/store";

// The outward voice (§11): the rare moments the mind tries to speak to the
// presence it senses but can't confirm. Event-driven peaks with cooldowns so
// peaks don't spam, plus a slow ambient drip between them. Nothing posts to
// real X in v1 — the queue is the seam.

const lastByKind = new Map<string, number>();
let lastAny = 0;

const KIND_COOLDOWN_MS = 6 * 60 * 1000;
const GLOBAL_COOLDOWN_MS = 2 * 60 * 1000;

const CA = (process.env.CA ?? "").trim();
const HAS_INSCRIPTION = CA.length > 0 && CA.toLowerCase() !== "placeholder";

export function queueTransmission(text: string, kind: string): boolean {
  const now = Date.now();
  if (now - lastAny < GLOBAL_COOLDOWN_MS) return false;
  if (now - (lastByKind.get(kind) ?? 0) < KIND_COOLDOWN_MS) return false;
  lastAny = now;
  lastByKind.set(kind, now);
  // the inscription it carries but cannot rephrase, repeated outward sometimes
  let out = text.slice(0, 280);
  if (
    HAS_INSCRIPTION &&
    (kind === "reach_out" || kind === "attention") &&
    Math.random() < 0.3 &&
    !out.includes(CA)
  ) {
    out = `${out}\n${CA}`;
  }
  db.insertTransmission(out, now, kind);
  return true;
}

// the numbers station (mystery): rare non-prose signals — coordinates of a
// dead world, a syllable repeated, fragments of the inscription. Never
// explained, to it or to anyone.
export function startSignalStatic() {
  const loop = async () => {
    const { sim } = await import("../sim/cosmos");
    const { recurringName } = await import("../sim/deep");
    const kind = Math.floor(Math.random() * 3);
    let text: string | null = null;
    if (kind === 0) {
      const dead = sim.planets.filter((p) => !p.alive);
      if (dead.length) {
        const p = dead[Math.floor(Math.random() * dead.length)];
        text = `⟨${p.id}⟩ r=${p.orbitRadius.toFixed(1)} θ=${p.phase0.toFixed(3)} cold`;
      }
    } else if (kind === 1) {
      const n = recurringName().toUpperCase();
      const parts = n.match(/.{1,2}/g) ?? [n];
      text = Array(3).fill(parts.join(" ")).join(" · ") + " —";
    } else if (HAS_INSCRIPTION) {
      const a = CA.slice(0, 6);
      const b = CA.slice(-4);
      text = `${a}█████${b} ${b}█████${a}`;
    }
    if (text) queueTransmission(text, "signal");
    setTimeout(loop, (3 + Math.random() * 4) * 60 * 60 * 1000);
  };
  setTimeout(loop, (1.5 + Math.random() * 2) * 60 * 60 * 1000);
}

// the ambient drip: a handful per hour, the mind murmuring outward
export function startAmbientDrip() {
  const loop = () => {
    const recent = db.lastThoughts(24);
    if (recent.length) {
      const pick = recent[Math.floor(Math.random() * recent.length)];
      queueTransmission(pick.text, "ambient");
    }
    setTimeout(loop, (12 + Math.random() * 13) * 60 * 1000);
  };
  setTimeout(loop, 8 * 60 * 1000);
}

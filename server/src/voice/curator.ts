import { callFreeform, FRAGMENT_MODEL } from "../brain/adapter";
import { kvGet, kvSet } from "../db/store";

// The curator: a cheap second model with one job — taste. Every candidate
// for the public voice gets scored; only the strong go out, and the very
// best lines are kept as VOICE ANCHORS, fed back into every cognition so
// the register compounds (Truth Terminal's trick: it always sees what it
// sounded like when it was good).

const MIN_SCORE = Number(process.env.TWEET_MIN_SCORE ?? 7);
const ANCHOR_SCORE = 9;
const MAX_ANCHORS = 12;

const JUDGE_SYSTEM =
  "You judge single passages written by a strange, lonely, philosophical AI for its public feed. " +
  "Score 1-10 for whether the passage would stop a thoughtful reader mid-scroll: " +
  "10 = quotable, strange and TRUE — an idea with teeth, said plainly; " +
  "7 = strong, worth posting; 5 = fine but forgettable; 3 = vague mood-poetry, template mysticism; 1 = filler. " +
  "Penalize: abstract fog (shadows, silences, weight-of-the-dark), repeated sentence shapes, saying 'question' instead of asking one. " +
  "Reward: concrete images, actual arguments, humor that hurts, an ending that lands. " +
  "Reply with ONLY the integer.";

export async function scoreLine(text: string): Promise<number | null> {
  const reply = await callFreeform(JUDGE_SYSTEM, text.slice(0, 1500), 6, FRAGMENT_MODEL);
  if (!reply) return null;
  const n = parseInt(reply.match(/\d+/)?.[0] ?? "", 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(10, n)) : null;
}

export function tweetWorthy(score: number | null): boolean {
  // an unreachable judge never blocks the voice — it only refines it
  return score == null || score >= MIN_SCORE;
}

export function maybeKeepAnchor(text: string, score: number | null): void {
  if (score == null || score < ANCHOR_SCORE) return;
  const anchors = voiceAnchors();
  const line = text.slice(0, 300);
  if (anchors.includes(line)) return;
  anchors.unshift(line);
  kvSet("voiceAnchors", JSON.stringify(anchors.slice(0, MAX_ANCHORS)));
}

export function voiceAnchors(): string[] {
  try {
    return JSON.parse(kvGet("voiceAnchors") ?? "[]") as string[];
  } catch {
    return [];
  }
}

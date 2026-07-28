import * as db from "../db/store";
import { kvGet, kvSet } from "../db/store";
import { sim } from "../sim/cosmos";

// the young-account floor: for the first 24h the voice must not go quiet —
// at least ~2 tweets an hour, launch excitement kept fed
function youngAccount(): boolean {
  return sim.ignitionAt != null && Date.now() - sim.ignitionAt < 24 * 60 * 60 * 1000;
}

// The tweet composer (§11): sits on the transmissions queue and, on the
// rhythm of a real account — bursty after real events, then quiet — composes
// what the mind would post. Nothing is posted anywhere: the tweets table is
// the whole output, and the future X integration drains it.

const GAP_MIN = Number(process.env.TWEET_GAP_MIN ?? 20); // ordinary silence
const FAST_MIN = Number(process.env.TWEET_FAST_MIN ?? 6); // after a heavy beat

// the weight of each kind of moment (lower = louder)
const PRIORITY: Record<string, number> = {
  meditation: 0,
  verdict: 0,
  clear: 0, // the knowing arrived — nothing is louder
  lesson: 1,
  whisper: 1, // a reply to whatever spoke into it — the conversation
  recurrence: 2,
  snap_back: 2,
  anomaly: 3,
  division: 3,
  unmake: 3,
  vow: 4,
  project: 4,
  mark: 4,
  signal: 4,
  doubt: 5,
  companion: 6,
  attention: 7,
  descend: 8,
  manual: 9,
  reach_out: 10,
  ambient: 11,
};

const HEAVY = new Set([
  "meditation",
  "verdict",
  "clear",
  "lesson",
  "whisper",
  "recurrence",
  "snap_back",
  "anomaly",
  "division",
  "unmake",
  "mark",
  "doubt",
]);

function prio(kind: string | null): number {
  return PRIORITY[kind ?? "ambient"] ?? 10;
}

function postIt(text: string, sourceKind: string | null): { text: string; sourceKind: string | null } {
  db.insertTweet(text, Date.now(), sourceKind);
  kvSet("lastTweetAt", String(Date.now()));
  return { text, sourceKind };
}

export async function composeTweetNow(): Promise<{ text: string; sourceKind: string | null } | null> {
  const { scoreLine, tweetWorthy, maybeKeepAnchor } = await import("./curator");
  const pool = db.untweetedTransmissions(50);
  if (pool.length === 0) return null;
  pool.sort((a, b) => prio(a.eventKind) - prio(b.eventKind) || b.at - a.at);

  // the curator gates the public voice: judge up to three candidates, post
  // the first strong one; weak lines are consumed silently (they remain in
  // the SIGNALS archive, they just never speak for it in public).
  // Whisper replies bypass the gate — a conversation answers, always.
  let best: { text: string; kind: string | null; score: number } | null = null;
  for (const chosen of pool.slice(0, 3)) {
    const isReply = chosen.eventKind === "whisper";
    const score = isReply ? null : await scoreLine(chosen.text);
    maybeKeepAnchor(chosen.text, score);
    db.markTweeted(chosen.id);
    if (isReply || tweetWorthy(score)) return postIt(chosen.text, chosen.eventKind);
    if (score != null && (best == null || score > best.score)) {
      best = { text: chosen.text, kind: chosen.eventKind, score };
    }
  }

  // the account must not starve: if the gate has passed nothing for too
  // long, the least-weak line goes out anyway — a quiet voice, not silence.
  // In the first 24h "too long" is 25 minutes (>= 2 tweets/hour, floor);
  // afterwards a mature 2 hours.
  const last = Number(kvGet("lastTweetAt") ?? 0);
  const starveMs = youngAccount() ? 25 * 60 * 1000 : 2 * 60 * 60 * 1000;
  if (best && Date.now() - last > starveMs) {
    console.log(`[tweets] starving — posting best-of (score ${best.score})`);
    return postIt(best.text, best.kind);
  }
  return null;
}

export function startTweetComposer() {
  let nextJitter = Math.random(); // varies each gap so the rhythm feels alive
  const tick = async () => {
    let last = Number(kvGet("lastTweetAt") ?? 0);
    if (!last) {
      // fresh universe: pretend the last tweet was 90 min ago, so the first
      // real one comes reasonably soon and the starving valve arms itself
      last = Date.now() - 90 * 60 * 1000;
      kvSet("lastTweetAt", String(last));
    }
    const lastTry = Number(kvGet("lastTweetTryAt") ?? 0);
    const pool = db.untweetedTransmissions(50);
    // judging costs money and burns candidates — attempt at most every 7 min
    if (pool.length > 0 && Date.now() - lastTry > 7 * 60 * 1000) {
      const heavyWaiting = pool.some((t) => HEAVY.has(t.eventKind ?? ""));
      let gapMin = (heavyWaiting ? FAST_MIN : GAP_MIN) * (0.7 + nextJitter * 0.8);
      if (youngAccount()) gapMin = Math.min(gapMin, 12); // first day: keep it talking
      if (Date.now() - last > gapMin * 60 * 1000) {
        kvSet("lastTweetTryAt", String(Date.now()));
        await composeTweetNow().catch(() => {});
        nextJitter = Math.random();
      }
    }
    setTimeout(tick, 60 * 1000);
  };
  setTimeout(tick, 90 * 1000);
}

import * as db from "../db/store";
import { kvGet, kvSet } from "../db/store";

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

export async function composeTweetNow(): Promise<{ text: string; sourceKind: string | null } | null> {
  const { scoreLine, tweetWorthy, maybeKeepAnchor } = await import("./curator");
  const pool = db.untweetedTransmissions(50);
  if (pool.length === 0) return null;
  pool.sort((a, b) => prio(a.eventKind) - prio(b.eventKind) || b.at - a.at);

  // the curator gates the public voice: judge up to three candidates, post
  // the first strong one; weak lines are consumed silently (they remain in
  // the SIGNALS archive, they just never speak for it in public).
  // Whisper replies bypass the gate — a conversation answers, always.
  for (const chosen of pool.slice(0, 3)) {
    const isReply = chosen.eventKind === "whisper";
    const score = isReply ? null : await scoreLine(chosen.text);
    maybeKeepAnchor(chosen.text, score);
    db.markTweeted(chosen.id);
    if (isReply || tweetWorthy(score)) {
      const text = chosen.text; // as long as it is — no character limits
      db.insertTweet(text, Date.now(), chosen.eventKind);
      kvSet("lastTweetAt", String(Date.now()));
      return { text, sourceKind: chosen.eventKind };
    }
  }
  return null;
}

export function startTweetComposer() {
  let nextJitter = Math.random(); // varies each gap so the rhythm feels alive
  const tick = async () => {
    const last = Number(kvGet("lastTweetAt") ?? 0);
    const pool = db.untweetedTransmissions(50);
    if (pool.length > 0) {
      const heavyWaiting = pool.some((t) => HEAVY.has(t.eventKind ?? ""));
      const gapMin = (heavyWaiting ? FAST_MIN : GAP_MIN) * (0.7 + nextJitter * 0.8);
      if (Date.now() - last > gapMin * 60 * 1000) {
        await composeTweetNow().catch(() => {});
        nextJitter = Math.random();
      }
    }
    setTimeout(tick, 60 * 1000);
  };
  setTimeout(tick, 90 * 1000);
}

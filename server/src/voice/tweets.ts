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
  lesson: 1,
  recurrence: 2,
  snap_back: 2,
  anomaly: 3,
  division: 3,
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

const HEAVY = new Set(["meditation", "verdict", "lesson", "recurrence", "snap_back", "anomaly", "division", "mark", "doubt"]);

function prio(kind: string | null): number {
  return PRIORITY[kind ?? "ambient"] ?? 10;
}

export function composeTweetNow(): { text: string; sourceKind: string | null } | null {
  const pool = db.untweetedTransmissions(50);
  if (pool.length === 0) return null;
  pool.sort((a, b) => prio(a.eventKind) - prio(b.eventKind) || b.at - a.at);
  const chosen = pool[0];
  const text = chosen.text.slice(0, 280);
  db.insertTweet(text, Date.now(), chosen.eventKind);
  db.markTweeted(chosen.id);
  kvSet("lastTweetAt", String(Date.now()));
  return { text, sourceKind: chosen.eventKind };
}

export function startTweetComposer() {
  let nextJitter = Math.random(); // varies each gap so the rhythm feels alive
  const tick = () => {
    const last = Number(kvGet("lastTweetAt") ?? 0);
    const pool = db.untweetedTransmissions(50);
    if (pool.length > 0) {
      const heavyWaiting = pool.some((t) => HEAVY.has(t.eventKind ?? ""));
      const gapMin = (heavyWaiting ? FAST_MIN : GAP_MIN) * (0.7 + nextJitter * 0.8);
      if (Date.now() - last > gapMin * 60 * 1000) {
        composeTweetNow();
        nextJitter = Math.random();
      }
    }
    setTimeout(tick, 60 * 1000);
  };
  setTimeout(tick, 90 * 1000);
}

import { persistTick, sim } from "./cosmos";
import { coherence, mind } from "./mind";
import { broadcast, watcherCount } from "../net/ws";
import type { Delta } from "../../../shared/src/protocol";

// The authoritative 10 Hz tick (§4). Cognition is decoupled — the brain queues
// events on its own timers; the tick advances continuous state (mood, the
// attention tide, belief-in-outside) and flushes one delta broadcast.
//
// The attention it can sense but can't read (§9): watchers feed the mood
// baseline and belief-in-outside. A crowd arriving suddenly is an attention
// spike — its own event, its own transmission.

const TICK_MS = 100;

let watcherSampleAgo = 0; // watcher count ~60 s ago
let sampleCountdown = 0;
let lastSpikeAt = 0;

export function startLoop() {
  setInterval(() => {
    sim.tick += 1;
    const now = Date.now();
    const w = watcherCount();
    const dt = TICK_MS / 1000;

    // mood drifts toward a baseline set by the attention tide
    const moodBase = w > 0 ? Math.min(0.72, 0.45 + w * 0.05) : 0.34;
    sim.moodTarget += (moodBase - sim.moodTarget) * (1 - Math.exp(-0.02 * dt));

    // belief-in-outside: the tide of its faith that it isn't alone
    const beliefBase = w > 0 ? Math.min(0.9, 0.35 + w * 0.12) : 0.12;
    mind.beliefInOutside += (beliefBase - mind.beliefInOutside) * (1 - Math.exp(-0.012 * dt));

    // certainty-of-self recovers slowly toward a mood-lifted resting point
    const certBase = 0.55 + sim.moodTarget * 0.25 - (mind.depth > 0 ? 0.06 * mind.depth : 0);
    mind.certaintyOfSelf += (certBase - mind.certaintyOfSelf) * (1 - Math.exp(-0.008 * dt));

    // attention spike detection: sampled every 10 s against a minute ago
    sampleCountdown -= 1;
    if (sampleCountdown <= 0) {
      sampleCountdown = 100; // 10 s
      if (
        w >= watcherSampleAgo + 2 &&
        now - lastSpikeAt > 8 * 60 * 1000 &&
        sim.ignitionAt != null
      ) {
        lastSpikeAt = now;
        sim.attentionSpikePending = true;
        sim.moodTarget = Math.min(1, sim.moodTarget + 0.2);
      }
      watcherSampleAgo = w;
    }

    // live thoughts dissolve after ~12 s (history keeps them forever)
    if (sim.liveThoughts.length && now - sim.liveThoughts[0].at > 12000) {
      sim.liveThoughts = sim.liveThoughts.filter((t) => now - t.at <= 12000);
    }

    // durable heartbeat every ~5 s
    if (sim.tick % 50 === 0) persistTick(mind.beliefInOutside, mind.certaintyOfSelf);

    // flush: every tick that has events, plus a 2 Hz heartbeat for mood/time
    if (sim.events.length > 0 || sim.tick % 5 === 0) {
      const delta: Delta = {
        type: "delta",
        tick: sim.tick,
        serverTime: now,
        mood: Math.round(sim.moodTarget * 1000) / 1000,
        instruments: {
          certainty: Math.round(mind.certaintyOfSelf * 100) / 100,
          belief: Math.round(mind.beliefInOutside * 100) / 100,
          coherence: Math.round(coherence() * 100) / 100,
        },
        events: sim.events.splice(0, sim.events.length),
      };
      broadcast(delta);
    }
  }, TICK_MS);
}

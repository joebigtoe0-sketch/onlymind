// All cosmos timestamps are server-epoch ms, so every tab renders the
// identical universe. The offset is measured from `hello`/`snapshot`.

let offsetMs = 0;

export function syncServerTime(serverTime: number) {
  offsetMs = serverTime - performance.now();
}

export function cosmosNow(): number {
  return performance.now() + offsetMs;
}

// ---- the genesis replay ------------------------------------------------------
// Joining an old universe still begins in the dark: the client compresses the
// whole history — ignition, star-front, every birth and death — into a
// fast-forward, then hands over to real time. The sweep lasts as long as the
// story deserves: ~1s per world ever born (dead ones included), floored at 4s
// for a young cosmos, capped at 13s for one that has run for days. A fresh
// universe (younger than ~90 s) plays its true opening instead.

const INTRO_DARK_S = 1.3;
const INTRO_MIN_S = 4;
const INTRO_MAX_S = 13;

let introIgnitionAt: number | null = null;
let introStart = 0;
let introDurS = INTRO_MAX_S;
let introConsidered = false; // one shot per page load — NOT per snapshot

export function maybeBeginIntro(ignitionAt: number | null, bodyCount = 0) {
  // snapshots also arrive on every websocket RECONNECT (server restart, a
  // network blip, waking the laptop) — only the first one may start a replay,
  // or the universe appears to "reload" mid-watch
  if (ignitionAt == null || introConsidered) return;
  introConsidered = true;
  const ageSec = (cosmosNow() - ignitionAt) / 1000;
  if (ageSec > 90) {
    introDurS = Math.min(INTRO_MAX_S, Math.max(INTRO_MIN_S, 1.5 + bodyCount * 0.95));
    introIgnitionAt = ignitionAt;
    introStart = performance.now();
  }
}

export function introActive(): boolean {
  if (introIgnitionAt == null) return false;
  const s = (performance.now() - introStart) / 1000;
  if (s >= INTRO_DARK_S + introDurS) {
    introIgnitionAt = null;
    return false;
  }
  return true;
}

function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

// The scene's clock: identical to cosmosNow() except during the replay, when
// it sweeps from the ignition to the present.
export function sceneNow(): number {
  if (introIgnitionAt == null) return cosmosNow();
  const s = (performance.now() - introStart) / 1000;
  if (s < INTRO_DARK_S) return introIgnitionAt; // the dark before the light
  const k = smoothstep((s - INTRO_DARK_S) / introDurS);
  const target = cosmosNow();
  if (k >= 1) {
    introIgnitionAt = null;
    return target;
  }
  return introIgnitionAt + (target - introIgnitionAt) * k;
}

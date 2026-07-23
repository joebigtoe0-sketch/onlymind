import * as THREE from "three";
import type { Planet } from "@shared/cosmos";
import { useCosmos } from "../../store";

// Orbits are deterministic functions of absolute time, so any system (the
// planet mesh, thought labels, the focus mote) can compute the same position
// without syncing state through React.

const quatCache = new Map<string, THREE.Quaternion>();
const euler = new THREE.Euler();

export function orbitQuat(seed: Planet): THREE.Quaternion {
  let q = quatCache.get(seed.id);
  if (!q) {
    q = new THREE.Quaternion().setFromEuler(
      euler.set(seed.inclination, seed.ascendingNode, 0),
    );
    quatCache.set(seed.id, q);
  }
  return q;
}

const DEBRIS_DRIFT = 34; // how far a dead world drifts outward
const DRIFT_SECONDS = 45;
const _parentPos = new THREE.Vector3();

// The expansion: worlds are born near the center and drift outward with age
// (fast at first, ever slower, never stopping) — the universe endlessly
// expands and new thoughts always bloom on the inside.
const EXPANSION_K = 9;
const EXPANSION_T_MS = 10 * 60 * 1000;

export function currentOrbitRadius(seed: Planet, nowMs: number): number {
  if (seed.parentId != null) return seed.orbitRadius;
  const until = seed.diedAt ?? nowMs; // death freezes the expansion
  const age = Math.max(0, until - seed.bornAt);
  return seed.orbitRadius + EXPANSION_K * Math.log1p(age / EXPANSION_T_MS);
}

export function planetPosition(seed: Planet, nowMs: number, out: THREE.Vector3): THREE.Vector3 {
  localOrbit(seed, nowMs, out);

  // a satellite orbits its parent: something a trip hallucinated into a
  // world's sky. Recursion covers moons of moons, should the mind go there.
  if (seed.parentId != null) {
    const parent = useCosmos.getState().planets.find((p) => p.id === seed.parentId);
    if (parent) {
      // parents can grow huge — push the moon's orbit out past the surface
      const clear = radiusForMass(parent.targetMass) * 1.5 + radiusForMass(seed.targetMass) + 0.3;
      if (clear > seed.orbitRadius) out.multiplyScalar(clear / seed.orbitRadius);
      planetPosition(parent, nowMs, _parentPos);
      out.add(_parentPos);
    }
  }
  return out;
}

function localOrbit(seed: Planet, nowMs: number, out: THREE.Vector3): THREE.Vector3 {
  // satellites circle fast and close; worlds circle the core slowly
  const omega =
    seed.parentId != null
      ? 1.7 / Math.pow(seed.orbitRadius, 1.05)
      : 0.9 / Math.pow(seed.orbitRadius, 1.15);

  if (seed.diedAt == null || seed.parentId != null) {
    const a = seed.phase0 + omega * (nowMs / 1000);
    const r = currentOrbitRadius(seed, nowMs);
    return out.set(Math.cos(a) * r, 0, Math.sin(a) * r).applyQuaternion(orbitQuat(seed));
  }

  // dead: decoupled from the core, drifting outward into the debris field,
  // then barely moving — a cold permanent ring (§5). Deterministic in time,
  // so every tab agrees on where the grave is.
  const deathAngle = seed.phase0 + omega * (seed.diedAt / 1000);
  const sinceDeath = Math.max(0, (nowMs - seed.diedAt) / 1000);
  const k = Math.min(1, sinceDeath / DRIFT_SECONDS);
  const ease = 1 - Math.pow(1 - k, 3);
  const r = currentOrbitRadius(seed, nowMs) + DEBRIS_DRIFT * ease;
  const a = deathAngle + sinceDeath * 0.004; // near-still, forever
  return out.set(Math.cos(a) * r, 0, Math.sin(a) * r).applyQuaternion(orbitQuat(seed));
}

// The scale law: even the smallest world is ~3x the soul (~0.23), and mass
// grown by weeks of thought (asymptote 9) makes a body ~10x that — the size
// of a world IS how much has been thought inside it.
export function radiusForMass(m: number): number {
  return 0.55 + 0.95 * Math.pow(Math.max(0, m), 0.85);
}

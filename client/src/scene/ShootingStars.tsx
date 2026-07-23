import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import * as THREE from "three";
import { useCosmos } from "../store";
import { introActive } from "../lib/time";

// Occasional meteors far beyond the worlds: a bright head with a long
// additive trail, streaking across the deep background every so often.
// Purely local decoration — each tab gets its own weather.

const STAR_COUNT = 2;

type Meteor = {
  active: boolean;
  nextAt: number; // performance.now ms
  bornAt: number;
  dur: number;
  from: THREE.Vector3;
  vel: THREE.Vector3;
};

function makeMeteor(first: boolean): Meteor {
  return {
    active: false,
    nextAt: performance.now() + (first ? 4000 : 12000) + Math.random() * 14000,
    bornAt: 0,
    dur: 1.2,
    from: new THREE.Vector3(),
    vel: new THREE.Vector3(),
  };
}

const _dir = new THREE.Vector3();

function spawn(m: Meteor) {
  // a point on a far shell, moving roughly tangentially across the sky
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const r = 160 + Math.random() * 160;
  m.from.setFromSphericalCoords(r, phi, theta);
  // tangent direction: cross with a random axis, keep it sky-parallel
  _dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  m.vel.crossVectors(m.from, _dir).normalize().multiplyScalar(90 + Math.random() * 130);
  m.dur = 0.9 + Math.random() * 0.9;
  m.bornAt = performance.now();
  m.active = true;
}

function MeteorStreak() {
  const head = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const st = useRef<Meteor | null>(null);
  if (st.current == null) st.current = makeMeteor(Math.random() < 0.5);

  useFrame(() => {
    const m = st.current!;
    const h = head.current;
    if (!h) return;
    const now = performance.now();
    const ignited = useCosmos.getState().ignitionAt != null;

    if (!m.active) {
      // parked far away at zero size until its moment comes
      h.scale.setScalar(0.001);
      if (ignited && !introActive() && now >= m.nextAt) spawn(m);
      return;
    }

    const k = (now - m.bornAt) / (m.dur * 1000);
    if (k >= 1) {
      m.active = false;
      m.nextAt = now + 9000 + Math.random() * 20000;
      h.scale.setScalar(0.001);
      return;
    }
    h.position.copy(m.from).addScaledVector(m.vel, k * m.dur);
    const bright = Math.sin(Math.PI * Math.min(1, k * 1.4)); // fast in, slow fade
    h.scale.setScalar(0.5 + bright * 0.4);
    mat.current!.color.setRGB(2.2 * bright + 0.2, 2.1 * bright + 0.2, 2.6 * bright + 0.3);
  });

  return (
    <Trail width={2.6} length={7} decay={2.2} color="#cdd8ff" attenuation={(w) => w * w}>
      <mesh ref={head} scale={0.001} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial ref={mat} toneMapped={false} transparent depthWrite={false} />
      </mesh>
    </Trail>
  );
}

export function ShootingStars() {
  return (
    <>
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <MeteorStreak key={i} />
      ))}
    </>
  );
}

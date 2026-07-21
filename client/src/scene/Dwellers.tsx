import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { introActive, sceneNow } from "../lib/time";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { getSharedGlowTexture } from "./lib/textures";

// The holder-shards: permanent small lives orbiting close to their home
// worlds. Dimmer and steadier than the mind's own descent-motes — they are
// always there, never wondering, unable to come back up.

const MAX_RENDERED = 240;
const _planet = new THREE.Vector3();
const TINT = new THREE.Color("#c9b8e8");

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function Dwellers() {
  const dwellers = useCosmos((s) => s.dwellers);
  const motes = useRef<(THREE.Group | null)[]>([]);
  const glowTex = useMemo(() => getSharedGlowTexture(), []);

  useFrame(() => {
    const now = sceneNow();
    const t = now / 1000;
    const { planets } = useCosmos.getState();
    const hidden = introActive();

    for (let i = 0; i < MAX_RENDERED; i++) {
      const g = motes.current[i];
      if (!g) continue;
      const d = dwellers[i];
      if (!d || hidden) {
        g.visible = false;
        continue;
      }
      const home = planets.find((p) => p.id === d.planetId);
      if (!home || !home.alive) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      planetPosition(home, now, _planet);
      const bodyR = radiusForMass(home.targetMass);
      const h1 = hash(d.id);
      const h2 = hash(d.id + "q");
      const orbitR = bodyR * (1.7 + h1 * 0.9);
      const speed = 0.5 + h2 * 0.5;
      const a = t * speed + h1 * Math.PI * 2;
      const tilt = (h2 - 0.5) * 1.2;
      g.position.set(
        _planet.x + Math.cos(a) * orbitR,
        _planet.y + Math.sin(a) * orbitR * Math.sin(tilt),
        _planet.z + Math.sin(a) * orbitR * Math.cos(tilt),
      );
      const age = (now - d.bornAt) / 1000;
      const grow = Math.min(1, Math.max(0, age) / 2.5);
      const flick = 0.85 + 0.15 * Math.sin(t * (2.5 + h1 * 2) + h2 * 9);
      g.scale.setScalar(Math.max(0.001, 0.085 * grow * flick));
    }
  });

  return (
    <>
      {Array.from({ length: MAX_RENDERED }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            motes.current[i] = el;
          }}
          visible={false}
        >
          <mesh>
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial color={[1.6, 1.4, 1.9]} toneMapped={false} />
          </mesh>
          <sprite scale={[8, 8, 1]}>
            <spriteMaterial
              map={glowTex}
              color={TINT}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.28}
            />
          </sprite>
        </group>
      ))}
    </>
  );
}

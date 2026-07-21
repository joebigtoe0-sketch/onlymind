import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Fragment, Planet } from "@shared/cosmos";
import { useCosmos } from "../store";
import { introActive, sceneNow } from "../lib/time";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { getSharedGlowTexture } from "./lib/textures";
import { ENERGY_FRAG, ENERGY_VERT } from "./lib/shaders";

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

// a dweller's current world position — used here and by the split-flights
// so an arriving piece lands exactly where the shard will live
export function dwellerPosition(
  d: Fragment,
  home: Planet,
  nowMs: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  planetPosition(home, nowMs, out);
  const bodyR = radiusForMass(home.targetMass);
  const t = nowMs / 1000;
  const h1 = hash(d.id);
  const h2 = hash(d.id + "q");
  const orbitR = bodyR * (1.7 + h1 * 0.9);
  const a = t * (0.5 + h2 * 0.5) + h1 * Math.PI * 2;
  const tilt = (h2 - 0.5) * 1.2;
  return out.set(
    out.x + Math.cos(a) * orbitR,
    out.y + Math.sin(a) * orbitR * Math.sin(tilt),
    out.z + Math.sin(a) * orbitR * Math.cos(tilt),
  );
}

export function Dwellers() {
  const dwellers = useCosmos((s) => s.dwellers);
  const motes = useRef<(THREE.Group | null)[]>([]);
  const glowTex = useMemo(() => getSharedGlowTexture(), []);

  // one shared wisp material for every shard; per-mote rotation varies them
  const energyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: TINT.clone() },
          uTime: { value: 0 },
          uSeed: { value: 1.3 },
          uWobble: { value: 0.5 },
          uIntensity: { value: 1.0 },
        },
        vertexShader: ENERGY_VERT,
        fragmentShader: ENERGY_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame(() => {
    const now = sceneNow();
    const t = now / 1000;
    const { planets } = useCosmos.getState();
    const hidden = introActive();
    energyMat.uniforms.uTime.value = performance.now() / 1000;

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
      dwellerPosition(d, home, now, _planet);
      g.position.copy(_planet);
      const h1 = hash(d.id);
      const h2 = hash(d.id + "q");
      // arrives only once its split-flight has landed (~2.2 s after birth)
      const age = (now - d.bornAt) / 1000;
      const grow = Math.min(1, Math.max(0, age - 2.2) / 1.5);
      const flick = 0.85 + 0.15 * Math.sin(t * (2.5 + h1 * 2) + h2 * 9);
      g.scale.setScalar(Math.max(0.001, 0.08 * grow * flick));
      const shell = g.children[2] as THREE.Mesh;
      shell.rotation.set(h1 * 6.28, t * (0.15 + h2 * 0.2), h2 * 6.28);
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
          <sprite scale={[7, 7, 1]}>
            <spriteMaterial
              map={glowTex}
              color={TINT}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.24}
            />
          </sprite>
          <mesh material={energyMat} scale={[2.6, 3.0, 2.6]}>
            <sphereGeometry args={[1, 24, 24]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

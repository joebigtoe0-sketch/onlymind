import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos, type Mark } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { getSharedGlowTexture } from "./lib/textures";

// Marks (§9): spectator-left traces. Small pale bodies in odd, tilted orbits
// that don't match anything else in the cosmos — they simply appeared.
// Found ones warm very slightly: the mind has puzzled over them.

const MAX_MARKS = 24;
const PALE = new THREE.Color("#aeb6d8");
const FOUND = new THREE.Color("#d8c9ae");

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function Marks() {
  const marks = useCosmos((s) => s.marks);
  const motes = useRef<(THREE.Group | null)[]>([]);
  const glowTex = useMemo(() => getSharedGlowTexture(), []);

  useFrame(() => {
    const now = sceneNow();
    const t = now / 1000;
    for (let i = 0; i < MAX_MARKS; i++) {
      const g = motes.current[i];
      if (!g) continue;
      const mark: Mark | undefined = marks[i];
      if (!mark) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      const h1 = hash(mark.id);
      const h2 = hash(mark.id + "x");
      // an orbit that doesn't belong: steep inclination, slow, retrograde
      const r = 11 + h1 * 22;
      const a = h2 * Math.PI * 2 - t * (0.05 + h1 * 0.04);
      const inc = 0.9 + h2 * 0.7;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      g.position.set(x, Math.sin(a) * r * Math.sin(inc), z * Math.cos(inc));

      const age = (now - mark.at) / 1000;
      const grow = Math.min(1, age / 3);
      const found = mark.foundAt != null;
      const mesh = g.children[0] as THREE.Mesh;
      const sprite = g.children[1] as THREE.Sprite;
      mesh.scale.setScalar(Math.max(0.001, 0.11 * grow));
      const mm = mesh.material as THREE.MeshBasicMaterial;
      mm.color.copy(found ? FOUND : PALE).multiplyScalar(1.5 + 0.3 * Math.sin(t * 2 + h1 * 9));
      const sm = sprite.material as THREE.SpriteMaterial;
      sm.color.copy(found ? FOUND : PALE);
      sm.opacity = (found ? 0.3 : 0.2) * grow;
      const ss = 1.1 * grow;
      sprite.scale.set(ss, ss, 1);
    }
  });

  return (
    <>
      {Array.from({ length: MAX_MARKS }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            motes.current[i] = el;
          }}
          visible={false}
        >
          <mesh>
            <sphereGeometry args={[1, 10, 10]} />
            <meshBasicMaterial toneMapped={false} />
          </mesh>
          <sprite>
            <spriteMaterial
              map={glowTex}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0}
            />
          </sprite>
        </group>
      ))}
    </>
  );
}

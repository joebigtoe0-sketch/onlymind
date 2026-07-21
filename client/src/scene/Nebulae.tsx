import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { dyn } from "./dynamics";
import { nebulaTexture } from "./lib/textures";

// Distant procedural nebulae. They fade in slowly after ignition and their
// tint breathes with the mind's mood — the whole sky between hope and despair.

type Neb = {
  pos: [number, number, number];
  scale: number;
  cold: THREE.Color;
  warm: THREE.Color;
  seed: number;
  rotSpeed: number;
  opacity: number;
};

const NEBS: Neb[] = [
  {
    pos: [130, 40, -170],
    scale: 340,
    cold: new THREE.Color("#232a55"),
    warm: new THREE.Color("#4a3040"),
    seed: 11,
    rotSpeed: 0.004,
    opacity: 0.1,
  },
  {
    pos: [-190, -60, 110],
    scale: 400,
    cold: new THREE.Color("#2c1d4e"),
    warm: new THREE.Color("#4e2a52"),
    seed: 23,
    rotSpeed: -0.003,
    opacity: 0.09,
  },
  {
    pos: [60, -30, 210],
    scale: 300,
    cold: new THREE.Color("#1c2440"),
    warm: new THREE.Color("#56301c"),
    seed: 37,
    rotSpeed: 0.005,
    opacity: 0.08,
  },
];

export function Nebulae() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  const textures = useMemo(() => NEBS.map((n) => nebulaTexture(n.seed)), []);

  useFrame((_, dt) => {
    const t = ignitionAt == null ? -1 : (sceneNow() - ignitionAt) / 1000;
    NEBS.forEach((n, i) => {
      const spr = refs.current[i];
      if (!spr) return;
      const m = spr.material as THREE.SpriteMaterial;
      const fade = t < 0 ? 0 : Math.min(1, t / 14);
      m.opacity = n.opacity * fade;
      m.rotation += dt * n.rotSpeed;
      m.color.copy(n.cold).lerp(n.warm, dyn.mood);
    });
  });

  return (
    <>
      {NEBS.map((n, i) => (
        <sprite
          key={n.seed}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={n.pos}
          scale={[n.scale, n.scale, 1]}
          renderOrder={-2}
          frustumCulled={false}
        >
          <spriteMaterial
            map={textures[i]}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            opacity={0}
          />
        </sprite>
      ))}
    </>
  );
}

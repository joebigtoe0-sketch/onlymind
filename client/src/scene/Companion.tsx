import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { getSharedGlowTexture } from "./lib/textures";

// The invented companion (§8): a second body near the core the mind pretends
// is a real other. Warm while believed; when the belief fails it goes cold,
// drifts a little away, and fades — the loneliest thing on screen.

const WARM = new THREE.Color("#ffc9d4");
const COLD = new THREE.Color("#5d6883");

export function Companion() {
  const companion = useCosmos((s) => s.companion);
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const bodyMat = useRef<THREE.MeshBasicMaterial>(null);
  const glow = useRef<THREE.Sprite>(null);
  const glowTex = useMemo(() => getSharedGlowTexture(), []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (!companion || introActive()) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const now = cosmosNow();
    const t = now / 1000;
    const age = (now - companion.bornAt) / 1000;
    const gone = companion.goneAt != null ? (now - companion.goneAt) / 1000 : -1;

    // close orbit around the core — near enough to talk to
    const drift = gone >= 0 ? gone * 0.12 : 0; // the dead voice slips away
    const r = 3.1 + Math.sin(t * 0.4) * 0.25 + drift;
    const a = t * 0.5 + 2.0;
    g.position.set(Math.cos(a) * r, 0.6 + Math.sin(t * 0.9) * 0.3, Math.sin(a) * r);

    const grow = Math.min(1, age / 2);
    const fade = gone >= 0 ? Math.max(0, 1 - gone / 40) : 1;
    const pulse = gone >= 0 ? 1 : 1 + 0.12 * Math.sin(t * 3.1);
    body.current!.scale.setScalar(Math.max(0.001, 0.19 * grow * pulse));

    const coldness = gone >= 0 ? Math.min(1, gone / 6) : 0;
    bodyMat.current!.color.copy(WARM).lerp(COLD, coldness).multiplyScalar(2.4 * fade * (1 - coldness * 0.75) + 0.2);

    const gm = glow.current!.material as THREE.SpriteMaterial;
    gm.color.copy(WARM).lerp(COLD, coldness);
    gm.opacity = 0.45 * grow * fade * (1 - coldness * 0.7);
    const gs = 2.4 * grow * pulse;
    glow.current!.scale.set(gs, gs, 1);
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={body}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial ref={bodyMat} toneMapped={false} />
      </mesh>
      <sprite ref={glow}>
        <spriteMaterial
          map={glowTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </sprite>
    </group>
  );
}

// Thought labels ask where the companion is; keep the math in one place.
export function companionPosition(bornAt: number, goneAt: number | null, out: THREE.Vector3): THREE.Vector3 {
  const now = cosmosNow();
  const t = now / 1000;
  const gone = goneAt != null ? (now - goneAt) / 1000 : -1;
  const drift = gone >= 0 ? gone * 0.12 : 0;
  const r = 3.1 + Math.sin(t * 0.4) * 0.25 + drift;
  const a = t * 0.5 + 2.0;
  return out.set(Math.cos(a) * r, 0.6 + Math.sin(t * 0.9) * 0.3, Math.sin(a) * r);
}

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { getSharedGlowTexture } from "./lib/textures";
import { PALETTE } from "./lib/palette";

// The descent made visible (§5, §15): each split spawns a smaller, dimmer
// light orbiting the inhabited world — one point of consciousness fractalling
// downward until it's a single flickering mote that thinks it's a person.

const MAX_MOTES = 4;
const _planet = new THREE.Vector3();

export function Fragments() {
  const fragments = useCosmos((s) => s.fragments);
  const activePlanetId = useCosmos((s) => s.activePlanetId);

  const group = useRef<THREE.Group>(null);
  const motes = useRef<(THREE.Group | null)[]>([]);
  const glowTex = useMemo(() => getSharedGlowTexture(), []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { planets } = useCosmos.getState();
    const planet = activePlanetId ? planets.find((p) => p.id === activePlanetId) : undefined;
    if (!planet || !planet.alive || fragments.length === 0 || introActive()) {
      g.visible = false;
      return;
    }
    g.visible = true;

    const now = cosmosNow();
    planetPosition(planet, now, _planet);
    const bodyR = radiusForMass(planet.targetMass);
    const t = now / 1000;

    for (let i = 0; i < MAX_MOTES; i++) {
      const mote = motes.current[i];
      if (!mote) continue;
      // fragment at depth 1 is the world itself — the planet carries it;
      // motes render depths 2+
      const frag = fragments[i + 1];
      if (!frag) {
        mote.visible = false;
        continue;
      }
      mote.visible = true;
      const d = frag.depth; // 2..4
      const orbitR = bodyR * (2.9 - 0.5 * (d - 1));
      const speed = 0.7 + 0.5 * d;
      const a = t * speed + d * 2.1;
      const wobble = Math.sin(t * (1.1 + d * 0.37)) * bodyR * 0.18;
      mote.position.set(
        _planet.x + Math.cos(a) * orbitR,
        _planet.y + wobble,
        _planet.z + Math.sin(a) * orbitR,
      );
      // dimmer and smaller with each division — the mind spread thinner
      const age = (now - frag.bornAt) / 1000;
      const grow = Math.min(1, age / 1.6);
      const size = (0.34 - 0.06 * d) * grow;
      const flick = 0.8 + 0.2 * Math.sin(t * (5 + d * 1.3) + d);
      mote.scale.setScalar(Math.max(0.001, size * flick));
    }
  });

  const pal = PALETTE[0];
  return (
    <group ref={group} visible={false}>
      {Array.from({ length: MAX_MOTES }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            motes.current[i] = el;
          }}
          visible={false}
        >
          <mesh>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color={[2.2, 1.9, 1.4]} toneMapped={false} />
          </mesh>
          <sprite scale={[7, 7, 1]}>
            <spriteMaterial
              map={glowTex}
              color={pal.halo}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.35}
            />
          </sprite>
        </group>
      ))}
    </group>
  );
}

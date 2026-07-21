import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { dyn } from "./dynamics";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { getSharedGlowTexture } from "./lib/textures";

// The mind's attention as a visible mote of light. At rest it wanders near
// the core. During a fixation it is captured into orbit around the idea,
// spirals inward as the pull deepens, and is absorbed (§5) — obsession
// rendered as gravity.

const _target = new THREE.Vector3();
const _planet = new THREE.Vector3();

export function Focus() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);

  const group = useRef<THREE.Group>(null);
  const mote = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const pos = useRef(new THREE.Vector3(0, 0.4, 0));
  const glowTex = useMemo(() => getSharedGlowTexture(), []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (ignitionAt == null || introActive()) {
      g.visible = false;
      return;
    }
    g.visible = true;

    const now = cosmosNow();
    const t = now / 1000;
    const { focus, planets } = useCosmos.getState();
    const seed = focus.planetId ? planets.find((p) => p.id === focus.planetId) : undefined;
    const phaseAge = (now - focus.sinceAt) / 1000;

    let heatTarget = 0;
    let visibility = 1;

    if (!seed || focus.phase === "core" || focus.phase === "release") {
      // wandering near the core: slow lissajous drift
      _target.set(
        Math.sin(t * 0.31) * 1.4,
        Math.sin(t * 0.23 + 2.0) * 0.55,
        Math.cos(t * 0.27) * 1.4,
      );
    } else {
      planetPosition(seed, now, _planet);
      const bodyR = radiusForMass(seed.targetMass);
      if (focus.phase === "capture") {
        // captured: orbit radius decays, angular speed rises — falling in
        const k = Math.min(1, phaseAge / 26);
        const orbitR = bodyR * (3.4 - 2.0 * k);
        const spin = 0.8 + 1.6 * k;
        const a = t * spin;
        _target.set(
          _planet.x + Math.cos(a) * orbitR,
          _planet.y + Math.sin(a * 0.63) * orbitR * 0.35,
          _planet.z + Math.sin(a) * orbitR,
        );
      } else if (focus.phase === "infall") {
        const k = Math.min(1, phaseAge / 2.4);
        const orbitR = bodyR * 1.4 * (1 - k);
        const a = t * (2.4 + 3.0 * k);
        _target.set(
          _planet.x + Math.cos(a) * orbitR,
          _planet.y,
          _planet.z + Math.sin(a) * orbitR,
        );
        heatTarget = k;
      } else {
        // absorbed: inside the idea; the planet carries the light now
        _target.copy(_planet);
        heatTarget = 1;
        visibility = 0.12;
      }
    }

    // damped travel keeps every transition continuous
    pos.current.lerp(_target, 1 - Math.exp(-dt * 2.4));
    g.position.copy(pos.current);

    // heat the fixated planet (read by Planet each frame)
    dyn.fixationPlanetId = focus.planetId;
    dyn.fixationHeat += (heatTarget - dyn.fixationHeat) * (1 - Math.exp(-dt * 2.0));

    const pulse = 1 + 0.18 * Math.sin(t * 5.1) * Math.sin(t * 1.7);
    mote.current!.scale.setScalar(0.14 * pulse * visibility + 0.02);
    const gm = glow.current!.material as THREE.SpriteMaterial;
    gm.opacity = 0.5 * visibility;
    const gs = 1.7 * pulse * visibility + 0.2;
    glow.current!.scale.set(gs, gs, 1);
  });

  return (
    <group ref={group} visible={false}>
      <Trail
        width={0.9}
        length={5}
        decay={1.8}
        color="#ffe2b0"
        attenuation={(w) => w * w}
      >
        <mesh ref={mote}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color={[3.2, 2.6, 1.7]} toneMapped={false} />
        </mesh>
      </Trail>
      <sprite ref={glow}>
        <spriteMaterial
          map={glowTex}
          color="#ffd9a0"
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </sprite>
    </group>
  );
}

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive } from "../lib/time";
import { dyn } from "./dynamics";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { getSharedGlowTexture } from "./lib/textures";
import { ENERGY_FRAG, PLANET_VERT } from "./lib/shaders";

// live world position of the mind-light — read by the camera's auto-follow
// and by the split-flights that detach from it
export const mindLightPos = new THREE.Vector3(0, 0.4, 0);

// The mind-light: the mind itself, made visible. In its clearest form —
// inside nothing — it is only this small light at the center, tracing a slow
// figure-eight. The moment it hallucinates (a thought lands on a world, a
// birth, a return, a fixation, a descent) it darts there and circles it.
// On snap-back it flares and comes home.

const _target = new THREE.Vector3();
const _planet = new THREE.Vector3();
const COLD = new THREE.Color("#a9b9ff");
const WARM = new THREE.Color("#ffd9a0");

const ATTEND_MS = 14000; // how long a fresh thought holds its attention

export function Focus() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);

  const group = useRef<THREE.Group>(null);
  const mote = useRef<THREE.Mesh>(null);
  const moteMat = useRef<THREE.MeshBasicMaterial>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const pos = useRef(new THREE.Vector3(0, 0.4, 0));
  const glowTex = useMemo(() => getSharedGlowTexture(), []);
  const tint = useMemo(() => new THREE.Color(), []);

  // the plasma wisps that make it an energy ball, not a dot
  const energyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color("#ffd9a0") },
          uTime: { value: 0 },
          uSeed: { value: 3.7 },
          uIntensity: { value: 1.7 },
        },
        vertexShader: PLANET_VERT,
        fragmentShader: ENERGY_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const now = cosmosNow();
    const tIgn = ignitionAt == null ? -1 : (now - ignitionAt) / 1000;
    // born out of the ignition flare; hidden during the genesis replay
    if (ignitionAt == null || tIgn < 2.2 || introActive()) {
      g.visible = false;
      return;
    }
    g.visible = true;

    const t = now / 1000;
    const { focus, planets, thoughts } = useCosmos.getState();
    const seed = focus.planetId ? planets.find((p) => p.id === focus.planetId) : undefined;
    const phaseAge = (now - focus.sinceAt) / 1000;

    let heatTarget = 0;
    let visibility = 1;

    if (seed && focus.phase !== "core" && focus.phase !== "release") {
      // the server-owned drama: capture spiral, infall, absorption
      planetPosition(seed, now, _planet);
      const bodyR = radiusForMass(seed.targetMass);
      if (focus.phase === "capture") {
        const k = Math.min(1, phaseAge / 26);
        const orbitR = bodyR * (3.4 - 2.0 * k);
        const a = t * (0.8 + 1.6 * k);
        _target.set(
          _planet.x + Math.cos(a) * orbitR,
          _planet.y + Math.sin(a * 0.63) * orbitR * 0.35,
          _planet.z + Math.sin(a) * orbitR,
        );
      } else if (focus.phase === "infall") {
        const k = Math.min(1, phaseAge / 2.4);
        const orbitR = bodyR * 1.4 * (1 - k);
        const a = t * (2.4 + 3.0 * k);
        _target.set(_planet.x + Math.cos(a) * orbitR, _planet.y, _planet.z + Math.sin(a) * orbitR);
        heatTarget = k;
      } else {
        // absorbed: inside the idea; the world carries the light now
        _target.copy(_planet);
        heatTarget = 1;
        visibility = 0.12;
      }
    } else {
      // free attention follows the freshest thought: a birth, a return, a
      // held idea — the light goes to it and circles while it thinks
      let attended = null as (typeof planets)[number] | null;
      for (let i = thoughts.length - 1; i >= 0; i--) {
        const th = thoughts[i];
        if (th.voice === "shard") continue; // the shards think for themselves
        if (now - th.at > ATTEND_MS) break;
        if (th.planetId) {
          attended = planets.find((p) => p.id === th.planetId && p.alive) ?? null;
          if (attended) break;
        }
      }
      if (attended) {
        planetPosition(attended, now, _planet);
        const orbitR = radiusForMass(attended.targetMass) * 2.2 + 0.4;
        const a = t * 1.25;
        _target.set(
          _planet.x + Math.cos(a) * orbitR,
          _planet.y + Math.sin(t * 1.9) * orbitR * 0.25,
          _planet.z + Math.sin(a) * orbitR,
        );
      } else {
        // the clearest form: alone at the center, tracing a slow figure-eight
        const u = t * 0.5;
        const A = 2.3;
        _target.set(
          A * Math.sin(u),
          0.35 * Math.sin(u * 2 + 1.1),
          A * Math.sin(u) * Math.cos(u),
        );
      }
    }

    // damped travel: instant intent, continuous motion
    pos.current.lerp(_target, 1 - Math.exp(-dt * 2.6));
    g.position.copy(pos.current);
    mindLightPos.copy(pos.current);

    // heat the inhabited world (read by Planet each frame)
    dyn.fixationPlanetId = focus.planetId;
    dyn.fixationHeat += (heatTarget - dyn.fixationHeat) * (1 - Math.exp(-dt * 2.0));

    // snap-back: the memories rejoin — the light flares as it comes home.
    // A split (a piece breaking off) gives a shorter, sharper flash.
    let snapGlow = 0;
    if (dyn.snapBackAt > 0) {
      const ts = (now - dyn.snapBackAt) / 1000;
      if (ts >= 0 && ts < 6) snapGlow = 2.2 * Math.exp(-ts * 1.3);
    }
    if (dyn.splitFlashAt > 0) {
      const ts = (now - dyn.splitFlashAt) / 1000;
      if (ts >= 0 && ts < 1.6) snapGlow += 1.6 * Math.exp(-ts * 3.2);
    }

    // it IS the mind now: a touch larger, breathing, mood-tinted
    tint.copy(COLD).lerp(WARM, dyn.mood);
    const settle = Math.min(1, (tIgn - 2.2) / 3); // inherits the ignition's light
    const pulse = 1 + 0.16 * Math.sin(t * 5.1) * Math.sin(t * 1.7) + 0.05 * Math.sin(t * 0.8);
    const coreScale = (0.24 * pulse * visibility + 0.02) * settle;
    mote.current!.scale.setScalar(coreScale);
    moteMat.current!.color.copy(tint).multiplyScalar(3.0 + snapGlow);

    const sh = shellRef.current!;
    sh.scale.setScalar(Math.max(0.001, coreScale * 2.9));
    sh.rotation.y = t * 0.22;
    energyMat.uniforms.uTime.value = performance.now() / 1000;
    (energyMat.uniforms.uColor.value as THREE.Color).copy(tint);
    energyMat.uniforms.uIntensity.value = (1.5 + snapGlow * 0.7) * visibility * settle;

    const gm = glow.current!.material as THREE.SpriteMaterial;
    gm.color.copy(tint);
    gm.opacity = Math.min(1, (0.45 + snapGlow * 0.25) * visibility * settle);
    const gs = (2.6 * pulse * visibility + 0.3) * (1 + snapGlow * 0.5) * settle;
    glow.current!.scale.set(gs, gs, 1);
  });

  return (
    <group ref={group} visible={false}>
      <Trail width={1.1} length={5} decay={1.8} color="#ffe2b0" attenuation={(w) => w * w}>
        <mesh ref={mote}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial ref={moteMat} toneMapped={false} />
        </mesh>
      </Trail>
      <mesh ref={shellRef} material={energyMat}>
        <sphereGeometry args={[1, 32, 32]} />
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

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Planet as PlanetData } from "@shared/cosmos";
import { useCosmos } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { dyn } from "./dynamics";
import { coreLightIntensity } from "./lib/coreLight";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { formParams } from "./lib/forms";
import { getRingTexture, getSharedGlowTexture } from "./lib/textures";
import { PLANET_FRAG, PLANET_VERT, SHELL_FRAG, SHELL_VERT } from "./lib/shaders";

// A held thought that accreted into a body (§5). Mass drives everything:
// radius, inner glow, halo. Recurrence raises targetMass; the visible mass
// eases toward it, so a fixation reads as a world slowly swelling.
// Clicking a world locks the spectator's focus onto it and opens its log.

const _pos = new THREE.Vector3();
const ASH_HALO = new THREE.Color("#7d8aa8");

export function Planet({ seed }: { seed: PlanetData }) {
  const ignitionAt = useCosmos((s) => s.ignitionAt);
  const select = useCosmos((s) => s.select);
  const gl = useThree((s) => s.gl);

  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const hit = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const ring = useRef<THREE.Mesh>(null);
  const atmo = useRef<THREE.Mesh>(null);
  const burst = useRef<THREE.Mesh>(null);
  const displayedMass = useRef(0.02);

  // the look, exactly as the mind dreamed it (or derived for older worlds)
  const fp = useMemo(() => formParams(seed), [seed.form, seed.paletteIndex, seed.id]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: seed.phase0 },
          uBase: { value: fp.colorA },
          uColB: { value: fp.colorB },
          uColC: { value: fp.colorC },
          uEmissive: { value: fp.colorB.clone().multiplyScalar(2.1) },
          uEmissiveMul: { value: 1 },
          uCoreLight: { value: 1 },
          uHot: { value: 0 },
          uDead: { value: 0 },
          uBand: { value: fp.band },
          uCrack: { value: fp.crack },
          uTurb: { value: fp.turb },
          uCrater: { value: fp.crater },
          uLand: { value: fp.land },
          uMarble: { value: fp.marble },
          uLumpy: { value: fp.lumpy },
          uAxis: { value: fp.axis },
        },
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
      }),
    [fp, seed.phase0],
  );

  // birth shockwave: the thought detonating into a body
  const burstMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: fp.colorB.clone().multiplyScalar(1.6) },
          uOpacity: { value: 0 },
        },
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [fp],
  );

  const atmoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: fp.colorB.clone().multiplyScalar(0.85) },
          uOpacity: { value: 0 },
        },
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
      }),
    [fp],
  );

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || ignitionAt == null) return;
    const now = sceneNow(); // during the genesis replay, this sweeps history
    const age = (now - seed.bornAt) / 1000;
    g.visible = age >= 0; // not yet born at this point of the replay
    const tIgn = (now - ignitionAt) / 1000;

    // accretion: ease toward the mass the mind's recurrences have granted
    displayedMass.current += (seed.targetMass - displayedMass.current) * (1 - Math.exp(-dt * 0.55));
    const m = displayedMass.current;
    const radius = radiusForMass(m);

    // orbit around the core; closer thoughts circle faster
    g.position.copy(planetPosition(seed, now, _pos));

    // death: cool over ~5 s after the snap-back, collapsing into a rock
    const dead = seed.diedAt == null ? 0 : Math.min(1, (now - seed.diedAt) / 5000);

    // birth: the split-flight lands first (~1.6 s), then the DETONATION —
    // a hard overshoot pop with a shockwave shell racing outward
    const bloomAge = age - 1.6;
    const x = Math.min(1, Math.max(0, bloomAge) / 2.0);
    const xm = x - 1;
    const easedBack = 1 + 4.8 * xm * xm * xm + 3.8 * xm * xm;
    const shrink = 1 - dead * 0.3; // an asteroid is less than the world was
    mesh.current!.scale.setScalar(Math.max(0.001, radius * easedBack * shrink));
    hit.current!.scale.setScalar(Math.max(0.001, radius * 2.4));

    // the world turns; the dead tumble end over end, slowly, forever
    const mm = mesh.current!;
    mm.rotation.y = age * fp.spin * (1 + dead * 0.6);
    const deadT = seed.diedAt == null ? 0 : Math.max(0, (now - seed.diedAt) / 1000);
    mm.rotation.x = dead * deadT * 0.045;
    mm.rotation.z = dead * deadT * 0.028;

    // shockwave: expands to ~7 radii in the first 1.6 s of the bloom
    if (burst.current) {
      const bk = Math.max(0, Math.min(1, bloomAge / 1.6));
      const active = bloomAge >= 0 && bk < 1;
      burst.current.visible = active;
      if (active) {
        burst.current.scale.setScalar(Math.max(0.01, radius * (0.3 + bk * 7)));
        burstMat.uniforms.uOpacity.value = Math.pow(1 - bk, 1.6) * 0.9;
      }
    }

    // while the mind's focus is inside this world, it runs hot (§5 fixation)
    let inhabited = dyn.fixationPlanetId === seed.id ? dyn.fixationHeat : 0;

    // doubt: the spell fracturing — the inhabited world flickers erratically
    if (inhabited > 0 && now < dyn.doubtUntil) {
      const s = now / 90;
      inhabited *= 0.55 + 0.45 * Math.abs(Math.sin(s * 1.7) * Math.sin(s * 2.31 + 1.2));
    }

    const u = material.uniforms;
    u.uTime.value = performance.now() / 1000;
    u.uCoreLight.value = coreLightIntensity(tIgn, dyn.mood);
    u.uHot.value = (2.4 * Math.exp(-Math.max(0, bloomAge) * 0.9) + inhabited * 1.1) * (1 - dead);
    u.uEmissiveMul.value = (0.55 + 0.5 * Math.min(m, 2.5)) * (1 + inhabited * 0.5);
    u.uDead.value = dead;

    const hs = halo.current!;
    const hm = hs.material as THREE.SpriteMaterial;
    const flash = 1.6 * Math.exp(-Math.max(0, bloomAge) * 3.2); // the detonation flare
    const hscale = radius * (7.5 + inhabited * 2.5 + flash * 4) * (1 - dead * 0.45);
    hs.scale.set(hscale, hscale, 1);
    hm.color.copy(fp.colorB).lerp(ASH_HALO, dead);
    hm.opacity =
      (0.09 + 0.11 * Math.min(1, m / 2.2) + flash + inhabited * 0.22) * (1 - dead * 0.8);

    // dreamed rings + atmosphere follow the body's size and death
    if (ring.current) {
      ring.current.scale.setScalar(Math.max(0.001, radius));
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.34 * (1 - dead * 0.75);
    }
    if (atmo.current) {
      atmo.current.scale.setScalar(Math.max(0.001, radius * 1.18));
      atmoMat.uniforms.uOpacity.value = fp.atmo * 0.55 * (1 - dead);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={mesh} material={material}>
        <sphereGeometry args={[1, 48, 48]} />
      </mesh>
      {/* generous invisible hit target — small worlds stay clickable */}
      <mesh
        ref={hit}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          // a deliberate click overrides auto-follow: the spectator takes over
          const st = useCosmos.getState();
          if (st.followMind) st.setFollow(false);
          st.select(seed.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          gl.domElement.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          gl.domElement.style.cursor = "";
        }}
      >
        <sphereGeometry args={[1, 12, 12]} />
      </mesh>
      <sprite ref={halo}>
        <spriteMaterial
          map={getSharedGlowTexture()}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </sprite>
      {fp.rings && (
        <mesh ref={ring} rotation={[1.35 + seed.inclination, seed.ascendingNode, 0]}>
          <ringGeometry args={[1.5, 2.45, 64]} />
          <meshBasicMaterial
            color={fp.colorB}
            alphaMap={getRingTexture()}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            opacity={0.34}
          />
        </mesh>
      )}
      {fp.atmo > 0.05 && (
        <mesh ref={atmo} material={atmoMat}>
          <sphereGeometry args={[1, 32, 32]} />
        </mesh>
      )}
      <mesh ref={burst} material={burstMat} visible={false}>
        <sphereGeometry args={[1, 24, 24]} />
      </mesh>
    </group>
  );
}

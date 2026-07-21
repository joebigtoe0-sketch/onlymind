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
  const displayedMass = useRef(0.02);

  // the look, exactly as the mind dreamed it (or derived for older worlds)
  const fp = useMemo(() => formParams(seed), [seed.form, seed.paletteIndex]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: seed.phase0 },
          uBase: { value: fp.colorA },
          uColB: { value: fp.colorB },
          uEmissive: { value: fp.colorB.clone().multiplyScalar(2.1) },
          uEmissiveMul: { value: 1 },
          uCoreLight: { value: 1 },
          uHot: { value: 0 },
          uDead: { value: 0 },
          uBand: { value: fp.band },
          uCrack: { value: fp.crack },
          uTurb: { value: fp.turb },
        },
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
      }),
    [fp, seed.phase0],
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

    // birth: scale in with a slight overshoot over ~2.4 s
    const x = Math.min(1, Math.max(0, age) / 2.4);
    const xm = x - 1;
    const easedBack = 1 + 2.70158 * xm * xm * xm + 1.70158 * xm * xm;
    mesh.current!.scale.setScalar(Math.max(0.001, radius * easedBack));
    hit.current!.scale.setScalar(Math.max(0.001, radius * 2.4));

    // while the mind's focus is inside this world, it runs hot (§5 fixation)
    let inhabited = dyn.fixationPlanetId === seed.id ? dyn.fixationHeat : 0;

    // doubt: the spell fracturing — the inhabited world flickers erratically
    if (inhabited > 0 && now < dyn.doubtUntil) {
      const s = now / 90;
      inhabited *= 0.55 + 0.45 * Math.abs(Math.sin(s * 1.7) * Math.sin(s * 2.31 + 1.2));
    }

    // death: cool over ~5 s after the snap-back
    const dead = seed.diedAt == null ? 0 : Math.min(1, (now - seed.diedAt) / 5000);

    const u = material.uniforms;
    u.uTime.value = performance.now() / 1000;
    u.uCoreLight.value = coreLightIntensity(tIgn, dyn.mood);
    u.uHot.value = (1.5 * Math.exp(-Math.max(0, age) * 0.7) + inhabited * 1.1) * (1 - dead);
    u.uEmissiveMul.value = (0.55 + 0.5 * Math.min(m, 2.5)) * (1 + inhabited * 0.5);
    u.uDead.value = dead;

    const hs = halo.current!;
    const hm = hs.material as THREE.SpriteMaterial;
    const hscale = radius * (7.5 + inhabited * 2.5);
    hs.scale.set(hscale, hscale, 1);
    hm.color.copy(fp.colorB).lerp(ASH_HALO, dead);
    hm.opacity =
      (0.09 + 0.11 * Math.min(1, m / 2.2) + 0.4 * Math.exp(-Math.max(0, age) * 0.9) + inhabited * 0.22) *
      (1 - dead * 0.8);

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
          select(seed.id);
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
    </group>
  );
}

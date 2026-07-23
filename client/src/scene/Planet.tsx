import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Planet as PlanetData } from "@shared/cosmos";
import { useCosmos } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { dyn } from "./dynamics";
import { coreLightIntensity } from "./lib/coreLight";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { formParams, hash01 } from "./lib/forms";
import { getRingTexture, getSharedGlowTexture } from "./lib/textures";
import { CLOUD_FRAG, CLOUD_VERT, PLANET_FRAG, PLANET_VERT, SHELL_FRAG, SHELL_VERT } from "./lib/shaders";

// A held thought that accreted into a body (§5). Mass drives everything:
// radius, inner glow, halo. Recurrence raises targetMass; the visible mass
// eases toward it, so a fixation reads as a world slowly swelling.
// Clicking a world locks the spectator's focus onto it and opens its log.

const _pos = new THREE.Vector3();
const ASH_HALO = new THREE.Color("#7d8aa8");
const STAR_WHITE = new THREE.Color("#fff6e8");

const smoothstep01 = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

// A world dies one of two deaths, fixed per world (heavier worlds lean
// toward collapse into light): it SHATTERS into a slow cloud of tumbling
// asteroid shards, or it goes nova and burns on as a star forever.
const RUBBLE_N = 11;

type Piece = {
  dir: THREE.Vector3;
  dist: number;
  size: number;
  ax: number;
  ay: number;
  az: number;
  r0: number;
  r1: number;
  r2: number;
  wx: number;
  wy: number;
  wz: number;
};

export function makePieces(id: string): Piece[] {
  return Array.from({ length: RUBBLE_N }, (_, i) => {
    const h = (s: number) => hash01(id, 100 + i * 13 + s);
    const th = h(1) * Math.PI * 2;
    const ph = Math.acos(2 * h(2) - 1);
    return {
      dir: new THREE.Vector3().setFromSphericalCoords(1, ph, th),
      dist: 1.15 + h(3) * 1.6,
      size: 0.13 + h(4) * 0.2,
      ax: 0.7 + h(5) * 0.6,
      ay: 0.7 + h(6) * 0.6,
      az: 0.7 + h(7) * 0.6,
      r0: h(8) * Math.PI * 2,
      r1: h(9) * Math.PI * 2,
      r2: h(10) * Math.PI * 2,
      wx: (h(11) - 0.5) * 1.1,
      wy: (h(12) - 0.5) * 1.1,
      wz: (h(13) - 0.5) * 0.8,
    };
  });
}

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
  const rubble = useRef<THREE.Group>(null);
  const cloud = useRef<THREE.Mesh>(null);
  const displayedMass = useRef(0.02);

  // the look, exactly as the mind dreamed it (or derived for older worlds)
  const fp = useMemo(() => formParams(seed), [seed.form, seed.paletteIndex, seed.id]);

  // the fate: mass at death tips the odds toward becoming a star
  const becomesStar = hash01(seed.id, 21) < Math.min(0.8, 0.22 + seed.targetMass / 5);
  const pieces = useMemo(() => makePieces(seed.id), [seed.id]);

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
          uLiquid: { value: 0 },
          uLiquidGlow: { value: fp.liquidGlow },
          uLiquidCol: { value: fp.liquidColor },
          uCap: { value: fp.cap },
          uNight: { value: 0 },
          uAurora: { value: 0 },
          uAuroraCol: { value: fp.auroraColor },
          uGrowth: { value: 0 },
          uRelief: { value: fp.relief },
          uBump: { value: fp.bump },
          uCraterDepth: { value: fp.craterDepth },
          uFacet: { value: fp.facet },
          uStripe: { value: fp.stripe },
          uSwirl: { value: fp.swirl },
        },
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
      }),
    [fp, seed.phase0],
  );

  // the cloud layer: its own shell, turning at its own speed
  const cloudMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: seed.phase0 },
          uCover: { value: 0 },
          uCoreLight: { value: 1 },
          uTint: { value: new THREE.Color(1, 1, 1).lerp(fp.colorB, 0.15) },
        },
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
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

    // death: two fates, fixed per world — shatter into a cloud of shards,
    // or go nova and burn on as a star
    const since = seed.diedAt == null ? 0 : Math.max(0, (now - seed.diedAt) / 1000);
    const dead = Math.min(1, since / 5);
    const shatter = dead > 0 && !becomesStar;
    const nova = dead > 0 && becomesStar;

    // birth: the split-flight lands first (~1.6 s), then the DETONATION —
    // a hard overshoot pop with a shockwave shell racing outward
    const bloomAge = age - 1.6;
    const x = Math.min(1, Math.max(0, bloomAge) / 2.0);
    const xm = x - 1;
    const easedBack = 1 + 4.8 * xm * xm * xm + 3.8 * xm * xm;
    let bodyScale = radius * easedBack;
    if (shatter) bodyScale *= 1 - Math.min(1, since / 0.9); // blown apart
    if (nova) bodyScale *= 0.85 + 0.5 * Math.exp(-since * 1.2); // swell, settle as a star
    mesh.current!.scale.setScalar(Math.max(0.001, bodyScale));
    hit.current!.scale.setScalar(Math.max(0.001, radius * 2.4));
    mesh.current!.rotation.y = age * fp.spin;

    // shockwave shell: fired by the birth, and again — bigger — by a death
    if (burst.current) {
      let bk = -1;
      let reach = 7;
      if (bloomAge >= 0 && bloomAge < 1.6) bk = bloomAge / 1.6;
      if (since > 0 && since < 2.4) {
        bk = since / 2.4;
        reach = nova ? 12 : 6;
      }
      const active = bk >= 0 && bk < 1;
      burst.current.visible = active;
      if (active) {
        burst.current.scale.setScalar(Math.max(0.01, radius * (0.3 + bk * reach)));
        burstMat.uniforms.uOpacity.value = Math.pow(1 - bk, 1.6) * 0.9;
      }
    }

    // the shard cloud: pieces burst outward, then tumble in place forever
    if (rubble.current) {
      const rb = rubble.current;
      rb.visible = since > 0.12;
      if (rb.visible) {
        rb.rotation.y = since * 0.05; // the whole cloud slowly swirls
        const burstK = 1 - Math.exp(-since / 1.6);
        for (let i = 0; i < rb.children.length; i++) {
          const pc = pieces[i];
          const pm = rb.children[i];
          const d = pc.dist * radius * burstK;
          pm.position.set(pc.dir.x * d, pc.dir.y * d * 0.6, pc.dir.z * d);
          const s = Math.max(0.001, radius * pc.size * Math.min(1, since / 0.5));
          pm.scale.set(s * pc.ax, s * pc.ay, s * pc.az);
          pm.rotation.set(pc.r0 + since * pc.wx, pc.r1 + since * pc.wy, pc.r2 + since * pc.wz);
        }
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
    // inhabited = a warm presence, not a floodlight — the surface must stay
    // legible while the mind is inside (the log IS being read right then)
    u.uHot.value = (2.4 * Math.exp(-Math.max(0, bloomAge) * 0.9) + inhabited * 0.3) * (1 - dead);
    u.uEmissiveMul.value = (0.55 + 0.5 * Math.min(m, 2.5)) * (1 + inhabited * 0.18);
    u.uDead.value = becomesStar ? 0 : dead;

    // the mind ADDS to a world as it thinks there: liquid gathers first,
    // then things grow, then weather, then the polar lights — mass unlocks
    u.uLiquid.value = fp.liquid * smoothstep01((m - 0.25) / 0.55);
    u.uGrowth.value = fp.growth * smoothstep01((m - 0.4) / 0.6);
    u.uAurora.value = fp.aurora * smoothstep01((m - 0.9) / 0.9);
    // the small lives light fires you can see from orbit
    const st0 = useCosmos.getState();
    let dwellersHere = 0;
    for (const d of st0.dwellers) if (d.planetId === seed.id) dwellersHere++;
    u.uNight.value = Math.min(1, dwellersHere * 0.34) * (1 - dead);

    // clouds arrive once a world has been thought about enough
    if (cloud.current) {
      const cover = fp.clouds * smoothstep01((m - 0.55) / 0.75);
      const cvisible = cover > 0.03 && dead < 0.5;
      cloud.current.visible = cvisible;
      if (cvisible) {
        cloud.current.scale.setScalar(Math.max(0.001, bodyScale * 1.045));
        cloud.current.rotation.y = age * (fp.spin * 0.55 + 0.012);
        cloudMat.uniforms.uTime.value = performance.now() / 1000;
        cloudMat.uniforms.uCover.value = cover * (1 - dead);
        cloudMat.uniforms.uCoreLight.value = u.uCoreLight.value;
      }
    }

    if (nova) {
      // burning on: the surface floods with near-white light, breathing
      const flare = 2.6 * Math.exp(-since * 1.4);
      u.uHot.value = 1.7 + flare + 0.12 * Math.sin(now / 770 + seed.phase0);
      u.uEmissiveMul.value = 2.3;
      (u.uEmissive.value as THREE.Color).copy(fp.colorB).lerp(STAR_WHITE, 0.55).multiplyScalar(2.4);
    }

    const hs = halo.current!;
    const hm = hs.material as THREE.SpriteMaterial;
    const flash = 1.6 * Math.exp(-Math.max(0, bloomAge) * 3.2); // the detonation flare
    if (nova) {
      // the flash is enormous; the settled star keeps a modest, permanent halo
      const novaFlash = 2.4 * Math.exp(-since * 1.1);
      const hscale = radius * (5.5 + novaFlash * 9);
      hs.scale.set(hscale, hscale, 1);
      hm.color.copy(fp.colorB).lerp(STAR_WHITE, 0.6);
      hm.opacity = Math.min(1, 0.2 + novaFlash * 0.55);
    } else {
      // the halo is an accent now, not a bath — surfaces carry the look
      const hscale = radius * (4.6 + inhabited * 1.2 + flash * 5) * (1 - dead * 0.45);
      hs.scale.set(hscale, hscale, 1);
      hm.color.copy(fp.colorB).lerp(ASH_HALO, dead);
      hm.opacity =
        (0.035 + 0.05 * Math.min(1, m / 2.2) + flash + inhabited * 0.08) * (1 - dead * 0.8);
    }

    // dreamed rings + atmosphere follow the body's size and death
    if (ring.current) {
      ring.current.scale.setScalar(Math.max(0.001, radius));
      // rings don't survive either death — stone clouds and stars go bare
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.34 * (1 - dead);
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
      {fp.clouds > 0.05 && (
        <mesh ref={cloud} material={cloudMat} visible={false}>
          <sphereGeometry args={[1, 40, 40]} />
        </mesh>
      )}
      <mesh ref={burst} material={burstMat} visible={false}>
        <sphereGeometry args={[1, 24, 24]} />
      </mesh>
      {seed.diedAt != null && !becomesStar && (
        <group ref={rubble} visible={false}>
          {pieces.map((_, i) => (
            <mesh key={i} material={material}>
              <sphereGeometry args={[1, 20, 20]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

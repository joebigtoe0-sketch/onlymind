import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Planet as PlanetData, WorldForm } from "@shared/cosmos";
import { formParams, type FormParams } from "./scene/lib/forms";
import { CLOUD_FRAG, CLOUD_VERT, PLANET_FRAG, PLANET_VERT } from "./scene/lib/shaders";
import { getRingTexture, getSharedGlowTexture } from "./scene/lib/textures";
import { makePieces } from "./scene/Planet";
import { PostFX } from "./scene/PostFX";

// The style atlas: one of every face a world can wear, all features unlocked.
// In the live cosmos these same looks emerge gradually — liquid gathers once
// a world has been thought about, clouds once it has weight, auroras late.
// This page exists so we can SEE the whole vocabulary at once.

type Arch = WorldForm["archetype"];

type Exhibit = {
  id: string; // drives every per-world hash jitter — change it, change the face
  label: string;
  archetype: Arch;
  colorA: string;
  colorB: string;
  rings?: boolean;
  night?: number; // settlement lights (the small lives)
  fate?: "rubble" | "star";
  bare?: boolean; // a newborn: nothing unlocked yet
  force?: Partial<FormParams>;
};

// two hand-picked palettes per archetype; two hash-ids each = four faces
const PALETTES: Record<Arch, [string, string][]> = {
  ember: [
    ["#3a1208", "#ff6a2a"],
    ["#2b0f1e", "#ff3d5e"],
  ],
  ocean: [
    ["#0a2e4f", "#3fd2ff"],
    ["#123a33", "#2affc8"],
  ],
  storm: [
    ["#4a3416", "#ffc76a"],
    ["#33202b", "#ff9ad5"],
  ],
  ice: [
    ["#1c2b45", "#bfe4ff"],
    ["#232741", "#d6c7ff"],
  ],
  verdant: [
    ["#12301c", "#5aff9a"],
    ["#1e3313", "#c8ff5a"],
  ],
  dust: [
    ["#3d2b1c", "#ffb87a"],
    ["#33241a", "#e8d9a8"],
  ],
  crystal: [
    ["#2a1440", "#c95aff"],
    ["#12333f", "#5affe4"],
  ],
  void: [
    ["#0a0a14", "#8a7dff"],
    ["#120a1a", "#ff7de8"],
  ],
};

const ARCHS: Arch[] = ["ember", "ocean", "storm", "ice", "verdant", "dust", "crystal", "void"];

function buildExhibits(): Exhibit[] {
  const out: Exhibit[] = [];
  for (const arch of ARCHS) {
    const [p1, p2] = PALETTES[arch];
    out.push(
      { id: `pv-${arch}-a`, label: arch, archetype: arch, colorA: p1[0], colorB: p1[1] },
      { id: `pv-${arch}-b`, label: `${arch} ii`, archetype: arch, colorA: p1[0], colorB: p1[1] },
      { id: `pv-${arch}-c`, label: `${arch} iii`, archetype: arch, colorA: p2[0], colorB: p2[1] },
      { id: `pv-${arch}-d`, label: `${arch} iv`, archetype: arch, colorA: p2[0], colorB: p2[1], rings: true },
    );
  }
  // the specials: states a world can be in, not just temperaments
  out.push(
    { id: "pv-bare", label: "newborn — nothing unlocked yet", archetype: "verdant", colorA: "#12301c", colorB: "#5aff9a", bare: true },
    { id: "pv-night", label: "the small lives (night side)", archetype: "verdant", colorA: "#0f2b18", colorB: "#63ffb0", night: 1 },
    { id: "pv-lightsea", label: "sea of light (rare wild)", archetype: "void", colorA: "#0a0a14", colorB: "#8a7dff", force: { liquid: 0.85, liquidGlow: 1 } },
    { id: "pv-stormwrap", label: "storm-wrapped", archetype: "storm", colorA: "#4a3416", colorB: "#ffc76a", force: { clouds: 0.95 } },
    { id: "pv-earthlike", label: "an earth that never was", archetype: "ocean", colorA: "#0a2e4f", colorB: "#3fd2ff", force: { land: 0.95, clouds: 0.55 } },
    { id: "pv-rubble", label: "death i — a cloud of stones", archetype: "dust", colorA: "#3d2b1c", colorB: "#ffb87a", fate: "rubble" },
    { id: "pv-star", label: "death ii — a star now", archetype: "ember", colorA: "#3a1208", colorB: "#ff6a2a", fate: "star" },
    // variant modes: sub-species that hash-roll inside each archetype
    { id: "pv-moon", label: "a bare moon", archetype: "dust", colorA: "#5a5a62", colorB: "#9a9aa2", force: { liquid: 0, land: 0, marble: 0, clouds: 0, crater: 0.95, lumpy: 0.15, growth: 0, atmo: 0 } },
    { id: "pv-gas", label: "a true gas giant", archetype: "storm", colorA: "#4a3416", colorB: "#ffc76a", force: { band: 1, turb: 0.4, crater: 0, liquid: 0, land: 0, lumpy: 0, marble: 0.2, growth: 0 } },
    { id: "pv-lava", label: "lava and rock", archetype: "ember", colorA: "#17100c", colorB: "#ff6a2a", force: { liquid: 0.75, liquidGlow: 1, land: 0.5, growth: 0 } },
    { id: "pv-waterworld", label: "a water-world", archetype: "ocean", colorA: "#0a2e4f", colorB: "#3fd2ff", force: { liquid: 0.95, land: 0.3, clouds: 0.4 } },
    { id: "pv-continental", label: "continental — seas in the low places", archetype: "verdant", colorA: "#12301c", colorB: "#5aff9a", force: { liquid: 0.4, land: 0.95, growth: 0.55, clouds: 0.3 } },
    { id: "pv-growth", label: "growth-blanketed", archetype: "verdant", colorA: "#1e3313", colorB: "#c8ff5a", force: { growth: 0.9, land: 0.9, liquid: 0.5 } },
    // the sculpt genes: shape itself as variety
    { id: "pv-crag", label: "crag world — carved silhouette", archetype: "dust", colorA: "#3d2b1c", colorB: "#ffb87a", force: { relief: 0.95, craterDepth: 0.4, liquid: 0, clouds: 0 } },
    { id: "pv-dented", label: "dented — craters you can feel", archetype: "ice", colorA: "#1c2b45", colorB: "#bfe4ff", force: { crater: 0.9, craterDepth: 0.95, liquid: 0, land: 0, clouds: 0 } },
    { id: "pv-blob", label: "blob-ball", archetype: "verdant", colorA: "#1e3313", colorB: "#c8ff5a", force: { bump: 0.85, relief: 0.2, liquid: 0, clouds: 0 } },
    { id: "pv-lowpoly", label: "low-poly — chiseled", archetype: "crystal", colorA: "#2a1440", colorB: "#c95aff", force: { facet: 1, relief: 0.6, lumpy: 0.15, marble: 0.5 } },
    { id: "pv-candy", label: "candy-striped", archetype: "storm", colorA: "#33202b", colorB: "#ff9ad5", force: { stripe: 0.95, swirl: 0, band: 0.3, marble: 0.1, land: 0 } },
    { id: "pv-barber", label: "barber-pole swirl", archetype: "crystal", colorA: "#12333f", colorB: "#5affe4", force: { stripe: 0.9, swirl: 3.2, marble: 0.1 } },
  );
  return out;
}

function fakeSeed(ex: Exhibit): PlanetData {
  return {
    id: ex.id,
    form: { archetype: ex.archetype, colorA: ex.colorA, colorB: ex.colorB, rings: !!ex.rings },
    paletteIndex: 0,
    phase0: 1.7,
  } as unknown as PlanetData;
}

const STAR_WHITE = new THREE.Color("#fff6e8");
const R = 1.35; // uniform gallery radius — size varies in the cosmos, not here

function PreviewPlanet({ ex, position }: { ex: Exhibit; position: [number, number, number] }) {
  const mesh = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const rubbleRef = useRef<THREE.Group>(null);

  const fp = useMemo(() => {
    const f = formParams(fakeSeed(ex));
    if (ex.force) Object.assign(f, ex.force);
    return f;
  }, [ex]);

  const pieces = useMemo(() => (ex.fate === "rubble" ? makePieces(ex.id) : []), [ex]);
  const unlock = ex.bare ? 0 : 1;
  const isStar = ex.fate === "star";
  const isRubble = ex.fate === "rubble";

  const material = useMemo(() => {
    const emissive = isStar
      ? fp.colorB.clone().lerp(STAR_WHITE, 0.55).multiplyScalar(2.4)
      : fp.colorB.clone().multiplyScalar(2.1);
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: 3.3 },
        uBase: { value: fp.colorA },
        uColB: { value: fp.colorB },
        uColC: { value: fp.colorC },
        uEmissive: { value: emissive },
        uEmissiveMul: { value: isStar ? 2.3 : 0.8 },
        uCoreLight: { value: 1.1 },
        uHot: { value: isStar ? 1.9 : 0 },
        uDead: { value: isRubble ? 1 : 0 },
        uBand: { value: fp.band },
        uCrack: { value: fp.crack },
        uTurb: { value: fp.turb },
        uCrater: { value: fp.crater },
        uLand: { value: fp.land * unlock },
        uMarble: { value: fp.marble },
        uLumpy: { value: fp.lumpy },
        uAxis: { value: fp.axis },
        uLiquid: { value: fp.liquid * unlock },
        uLiquidGlow: { value: fp.liquidGlow },
        uLiquidCol: { value: fp.liquidColor },
        uCap: { value: fp.cap * unlock },
        uNight: { value: ex.night ?? 0 },
        uAurora: { value: fp.aurora * unlock },
        uAuroraCol: { value: fp.auroraColor },
        uGrowth: { value: fp.growth * unlock },
        uRelief: { value: fp.relief },
        uBump: { value: fp.bump },
        uCraterDepth: { value: fp.craterDepth },
        uFacet: { value: fp.facet },
        uStripe: { value: fp.stripe },
        uSwirl: { value: fp.swirl },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });
  }, [fp, ex, unlock, isStar, isRubble]);

  const cloudMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: 3.3 },
          uCover: { value: fp.clouds * unlock },
          uCoreLight: { value: 1.1 },
          uTint: { value: new THREE.Color(1, 1, 1).lerp(fp.colorB, 0.15) },
        },
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    [fp, unlock],
  );

  useFrame(() => {
    const t = performance.now() / 1000;
    material.uniforms.uTime.value = t;
    cloudMat.uniforms.uTime.value = t;
    if (mesh.current) mesh.current.rotation.y = t * 0.1;
    if (cloudRef.current) cloudRef.current.rotation.y = t * 0.055;
    if (isStar) material.uniforms.uHot.value = 1.9 + 0.12 * Math.sin(t * 1.3);
    if (rubbleRef.current) {
      // a settled cloud, forever mid-swirl
      rubbleRef.current.rotation.y = t * 0.05;
      const since = 40;
      for (let i = 0; i < rubbleRef.current.children.length; i++) {
        const pc = pieces[i];
        const pm = rubbleRef.current.children[i];
        const d = pc.dist * R;
        pm.position.set(pc.dir.x * d, pc.dir.y * d * 0.6, pc.dir.z * d);
        const s = R * pc.size;
        pm.scale.set(s * pc.ax, s * pc.ay, s * pc.az);
        pm.rotation.set(pc.r0 + since * pc.wx + t * pc.wx, pc.r1 + t * pc.wy, pc.r2 + t * pc.wz);
      }
    }
  });

  return (
    <group position={position}>
      {!isRubble && (
        <mesh ref={mesh} material={material} scale={R}>
          <sphereGeometry args={[1, 48, 48]} />
        </mesh>
      )}
      {isRubble && (
        <group ref={rubbleRef}>
          {pieces.map((_, i) => (
            <mesh key={i} material={material}>
              <sphereGeometry args={[1, 20, 20]} />
            </mesh>
          ))}
        </group>
      )}
      {fp.clouds * unlock > 0.03 && !isRubble && !isStar && (
        <mesh ref={cloudRef} material={cloudMat} scale={R * 1.045}>
          <sphereGeometry args={[1, 40, 40]} />
        </mesh>
      )}
      {fp.rings && !isRubble && (
        <mesh rotation={[1.35, 0.4, 0]} scale={R}>
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
      {isStar && (
        <sprite scale={[R * 7, R * 7, 1]}>
          <spriteMaterial
            map={getSharedGlowTexture()}
            color={fp.colorB.clone().lerp(STAR_WHITE, 0.6)}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            opacity={0.28}
          />
        </sprite>
      )}
      <Html center position={[0, -2.2, 0]} className="pv-label" zIndexRange={[5, 0]}>
        {ex.label}
      </Html>
    </group>
  );
}

export function PreviewGallery() {
  const exhibits = useMemo(buildExhibits, []);
  const cols = 4;

  return (
    <Canvas
      flat
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 66], fov: 50, near: 0.1, far: 400 }}
    >
      <color attach="background" args={["#05060b"]} />
      {/* grid sits behind the origin: the shader lights every body from the
          origin, so the whole atlas reads front-lit with outward night sides */}
      <group position={[0, 0, -7]}>
        {exhibits.map((ex, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const rows = Math.ceil(exhibits.length / cols);
          const x = (col - (cols - 1) / 2) * 5.4;
          const y = ((rows - 1) / 2) * 5.6 - row * 5.6;
          return <PreviewPlanet key={ex.id} ex={ex} position={[x, y, 0]} />;
        })}
      </group>
      <OrbitControls
        enableRotate={false}
        enablePan
        screenSpacePanning
        minDistance={6}
        maxDistance={130}
        zoomSpeed={1.1}
      />
      <PostFX />
    </Canvas>
  );
}

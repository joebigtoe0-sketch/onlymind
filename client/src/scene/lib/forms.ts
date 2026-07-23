import * as THREE from "three";
import type { Planet, WorldForm } from "@shared/cosmos";
import { PALETTE } from "./palette";

// Every world's look: authored by the mind (form) or derived stably from its
// palette (older worlds). Archetypes set a temperament; a per-world hash of
// the planet's id then jitters every trait, so no two worlds — even of the
// same archetype — ever wear the same face.

export type FormParams = {
  colorA: THREE.Color;
  colorB: THREE.Color;
  colorC: THREE.Color; // third color: continents, marble folds
  band: number; // latitude banding (gas giant)
  crack: number; // glowing veins
  turb: number; // noise turbulence
  atmo: number; // fresnel atmosphere shell
  lumpy: number; // silhouette irregularity (vertex displacement)
  crater: number; // impact craters while alive
  land: number; // continents of colorC over a colorA sea
  marble: number; // domain-warped tri-color folds
  liquid: number; // moving liquid filling the lowlands
  liquidGlow: number; // 0 dark water .. 1 lava / light-sea
  liquidColor: THREE.Color;
  cap: number; // polar ice caps
  clouds: number; // rotating cloud shell coverage
  aurora: number; // polar aurora bands
  auroraColor: THREE.Color;
  growth: number; // living blankets on the dry ground
  relief: number; // rocky crag silhouette (vertex ridges)
  bump: number; // blob-ball bumps
  craterDepth: number; // craters that dent the geometry
  facet: number; // flat-shaded low-poly look
  stripe: number; // hard candy-stripes
  swirl: number; // stripe twist (barber-pole)
  axis: THREE.Vector3; // the potato axes death collapses into
  spin: number; // signed rad/s of surface rotation
  rings: boolean;
};

type ArchTraits = {
  band: number;
  crack: number;
  turb: number;
  atmo: number;
  lumpy: number;
  crater: number;
  land: number;
  marble: number;
  liquid: number;
  liquidGlow: number;
  cap: number;
  clouds: number;
  aurora: number;
};

const ARCH: Record<WorldForm["archetype"], ArchTraits> = {
  ember: { band: 0.1, crack: 0.95, turb: 0.6, atmo: 0.15, lumpy: 0.05, crater: 0.12, land: 0, marble: 0.35, liquid: 0.55, liquidGlow: 1, cap: 0, clouds: 0.1, aurora: 0.05 },
  ocean: { band: 0.35, crack: 0.0, turb: 0.3, atmo: 0.55, lumpy: 0.0, crater: 0.0, land: 0.8, marble: 0.15, liquid: 0.9, liquidGlow: 0.06, cap: 0.22, clouds: 0.45, aurora: 0.05 },
  storm: { band: 0.95, crack: 0.0, turb: 0.85, atmo: 0.6, lumpy: 0.0, crater: 0.0, land: 0, marble: 0.55, liquid: 0.2, liquidGlow: 0.1, cap: 0, clouds: 0.8, aurora: 0.2 },
  ice: { band: 0.15, crack: 0.3, turb: 0.15, atmo: 0.35, lumpy: 0.08, crater: 0.55, land: 0.2, marble: 0.1, liquid: 0.25, liquidGlow: 0, cap: 0.75, clouds: 0.2, aurora: 0.4 },
  verdant: { band: 0.2, crack: 0.0, turb: 0.6, atmo: 0.45, lumpy: 0.04, crater: 0.1, land: 0.9, marble: 0.1, liquid: 0.6, liquidGlow: 0.05, cap: 0.2, clouds: 0.5, aurora: 0.05 },
  dust: { band: 0.55, crack: 0.0, turb: 0.25, atmo: 0.1, lumpy: 0.3, crater: 0.9, land: 0, marble: 0.0, liquid: 0.06, liquidGlow: 0, cap: 0.05, clouds: 0.08, aurora: 0 },
  crystal: { band: 0.0, crack: 0.75, turb: 0.95, atmo: 0.2, lumpy: 0.18, crater: 0.0, land: 0, marble: 0.7, liquid: 0.35, liquidGlow: 0.8, cap: 0, clouds: 0.1, aurora: 0.3 },
  void: { band: 0.0, crack: 0.18, turb: 0.2, atmo: 0.0, lumpy: 0.1, crater: 0.3, land: 0, marble: 0.15, liquid: 0.15, liquidGlow: 0.7, cap: 0, clouds: 0, aurora: 0.5 },
};

// stable fallback for worlds dreamed before forms existed
const PALETTE_ARCH: WorldForm["archetype"][] = ["ember", "ocean", "crystal", "verdant", "storm", "ice"];

// stable per-world randomness: hash of (id, salt) → [0, 1)
export function hash01(id: string, salt: number): number {
  let h = (2166136261 ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function formParams(seed: Planet): FormParams {
  let colorA: THREE.Color;
  let colorB: THREE.Color;
  let arch: WorldForm["archetype"];
  let rings: boolean;

  if (seed.form) {
    colorA = new THREE.Color(seed.form.colorA);
    colorB = new THREE.Color(seed.form.colorB);
    arch = seed.form.archetype;
    rings = seed.form.rings;
  } else {
    const pal = PALETTE[seed.paletteIndex % PALETTE.length];
    colorA = pal.base.clone();
    colorB = pal.halo.clone();
    arch = PALETTE_ARCH[seed.paletteIndex % PALETTE_ARCH.length];
    rings = hash01(seed.id, 16) < 0.15;
  }

  const a = ARCH[arch];
  const j = (salt: number) => hash01(seed.id, salt);

  // twin-proofing: even two worlds dreamed in the SAME archetype and colors
  // drift apart — every world's hues are nudged by its own hash
  colorA.offsetHSL((j(24) - 0.5) * 0.12, (j(25) - 0.5) * 0.16, (j(26) - 0.5) * 0.08);
  colorB.offsetHSL((j(27) - 0.5) * 0.12, (j(28) - 0.5) * 0.14, (j(29) - 0.5) * 0.08);
  // multiplicative wobble: same temperament, never the same face
  const wob = (v: number, salt: number) => clamp01(v * (0.65 + 0.7 * j(salt)));

  // the third color: drawn between the two dreamed ones, then pulled to a
  // different hue — this is what makes worlds read as multi-colored
  const colorC = colorA
    .clone()
    .lerp(colorB, 0.3 + 0.4 * j(8))
    .offsetHSL((j(9) - 0.5) * 0.5, 0.1, 0.05);

  // the liquid: lava for ember (the world's own hot color), glowing colorC
  // for crystal/void (any color a dream needs), deep base-color seas for water
  const liquidColor =
    a.liquidGlow >= 0.9
      ? colorB.clone().offsetHSL((j(17) - 0.5) * 0.06, 0.1, 0.08)
      : a.liquidGlow > 0.5
        ? colorC.clone().offsetHSL((j(17) - 0.5) * 0.3, 0.15, 0.12)
        : colorA.clone().multiplyScalar(0.8).offsetHSL(0, 0.08, -0.04);

  // the sculpt genes: how much the SHAPE itself departs from a sphere,
  // and whether the surface wears hard graphic patterns
  const relief0 =
    arch === "dust" ? 0.5 : arch === "ember" ? 0.35 : arch === "crystal" ? 0.25 : arch === "ice" ? 0.15 : 0.06;
  const facet0 = arch === "crystal" ? 0.5 : arch === "ice" ? 0.25 : 0.0;

  const fp: FormParams = {
    colorA,
    colorB,
    colorC,
    band: wob(a.band, 1),
    crack: wob(a.crack, 2),
    turb: wob(a.turb, 3),
    atmo: a.atmo,
    lumpy: a.lumpy * (0.5 + 1.3 * j(4)),
    crater: clamp01(a.crater + (j(5) - 0.5) * 0.4),
    land: clamp01(a.land + (j(6) - 0.5) * 0.35),
    marble: clamp01(a.marble + (j(7) - 0.5) * 0.45),
    relief: clamp01(relief0 * (0.3 + 1.5 * j(31))),
    bump: j(32) < 0.18 ? 0.35 + 0.5 * j(33) : 0,
    craterDepth: 0, // assigned below with crater-heavy worlds
    facet: j(34) < facet0 ? 0.85 : 0,
    stripe: 0,
    swirl: 0,
    liquid: clamp01(a.liquid * (0.35 + 1.3 * j(18))),
    liquidGlow: a.liquidGlow,
    liquidColor,
    cap: clamp01(a.cap * (0.4 + 1.2 * j(19))),
    clouds: clamp01(a.clouds * (0.5 + j(20))),
    aurora: clamp01(a.aurora * (0.4 + 1.2 * j(21))),
    auroraColor: colorB.clone().lerp(colorC, j(22)).offsetHSL(0.08, 0.2, 0.15),
    growth: clamp01(
      (arch === "verdant" ? 0.65 : arch === "ocean" ? 0.3 : 0.08) * (0.4 + 1.3 * j(30)),
    ),
    axis: new THREE.Vector3(
      1 + (j(10) - 0.5) * 0.55,
      1 + (j(11) - 0.5) * 0.55,
      1 + (j(12) - 0.5) * 0.55,
    ),
    spin: (j(13) < 0.5 ? -1 : 1) * (0.02 + 0.07 * j(14)),
    rings,
  };

  // cratered temperaments get real dents, not just painted shadows
  fp.craterDepth = fp.crater > 0.4 ? clamp01(fp.crater * (0.5 + j(35))) : 0;

  // candy-stripes: any world can be born graphic — hard twisting bands
  if (j(36) < 0.11) {
    fp.stripe = 0.65 + 0.35 * j(37);
    fp.swirl = j(38) < 0.4 ? 0 : 1.5 + 2.5 * j(39); // straight or barber-pole
    fp.marble = Math.min(fp.marble, 0.2);
    fp.land = Math.min(fp.land, 0.3);
  }

  // VARIANT MODES: whole sub-species of world within each archetype, so two
  // worlds of the same temperament can still be different KINDS of thing
  const v = j(23);
  if ((arch === "dust" || arch === "ice" || arch === "void") && v < 0.3) {
    // a bare moon: grey, dead-still, crater-bitten, airless
    const grey = new THREE.Color("#9a9aa2");
    colorA.lerp(grey, 0.75).offsetHSL(0, 0, -0.12);
    colorB.lerp(grey, 0.7);
    fp.crater = Math.max(fp.crater, 0.85);
    fp.liquid = 0;
    fp.land = 0;
    fp.marble = 0;
    fp.clouds = 0;
    fp.atmo = 0;
    fp.growth = 0;
    fp.lumpy = Math.max(fp.lumpy, 0.12);
    fp.craterDepth = Math.max(fp.craterDepth, 0.7); // dents you can SEE
    fp.stripe = 0;
  } else if (arch === "storm" && v < 0.4) {
    // a true gas giant: nothing but banded weather, slightly oblate
    fp.band = 1;
    fp.turb *= 0.55;
    fp.crater = 0;
    fp.liquid = 0;
    fp.land = 0;
    fp.lumpy = 0;
    fp.growth = 0;
    fp.relief = 0;
    fp.bump = 0;
    fp.craterDepth = 0;
    fp.facet = 0;
    fp.marble = Math.min(fp.marble, 0.25);
    fp.axis.set(1.02, 0.93, 1.02);
  } else if (arch === "ember" && v < 0.35) {
    // lava-and-rock: rivers of fire through a near-black crust
    colorA.lerp(new THREE.Color("#17100c"), 0.7);
    fp.liquid = Math.max(fp.liquid, 0.7);
    fp.liquidGlow = 1;
    fp.land = 0.5;
    fp.crater = Math.max(fp.crater, 0.3);
    fp.relief = Math.max(fp.relief, 0.5);
    fp.growth = 0;
  } else if ((arch === "ocean" || arch === "verdant") && v < 0.28) {
    // a water-world: one endless sea, a few island specks
    fp.liquid = 0.95;
    fp.land = Math.min(fp.land, 0.35);
    fp.clouds = Math.max(fp.clouds, 0.35);
  } else if ((arch === "ocean" || arch === "verdant") && v > 0.74) {
    // continental: mostly ground, seas in the low places only
    fp.liquid = Math.min(fp.liquid, 0.42);
    fp.land = Math.max(fp.land, 0.9);
    fp.growth = Math.max(fp.growth, 0.45);
  }

  // rare temperament breaks, so the sky holds surprises: a world dreamed in
  // many colors at once, one that is nearly all continent, a sea of light
  // where no light should be, or auroras far from any pole that earns them
  const wild = j(15);
  if (wild < 0.14) fp.marble = Math.max(fp.marble, 0.75);
  else if (wild > 0.9) fp.land = Math.max(fp.land, 0.85);
  const wild2 = j(16);
  if (wild2 < 0.08) {
    fp.liquid = Math.max(fp.liquid, 0.6);
    fp.liquidGlow = Math.max(fp.liquidGlow, 0.85);
  } else if (wild2 > 0.9) {
    fp.aurora = Math.max(fp.aurora, 0.45);
  }

  return fp;
}

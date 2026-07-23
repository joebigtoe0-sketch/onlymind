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
};

const ARCH: Record<WorldForm["archetype"], ArchTraits> = {
  ember: { band: 0.1, crack: 0.95, turb: 0.6, atmo: 0.15, lumpy: 0.05, crater: 0.12, land: 0, marble: 0.35 },
  ocean: { band: 0.35, crack: 0.0, turb: 0.3, atmo: 0.55, lumpy: 0.0, crater: 0.0, land: 0.8, marble: 0.15 },
  storm: { band: 0.95, crack: 0.0, turb: 0.85, atmo: 0.6, lumpy: 0.0, crater: 0.0, land: 0, marble: 0.55 },
  ice: { band: 0.15, crack: 0.3, turb: 0.15, atmo: 0.35, lumpy: 0.08, crater: 0.55, land: 0.2, marble: 0.1 },
  verdant: { band: 0.2, crack: 0.0, turb: 0.6, atmo: 0.45, lumpy: 0.04, crater: 0.1, land: 0.9, marble: 0.1 },
  dust: { band: 0.55, crack: 0.0, turb: 0.25, atmo: 0.1, lumpy: 0.3, crater: 0.9, land: 0, marble: 0.0 },
  crystal: { band: 0.0, crack: 0.75, turb: 0.95, atmo: 0.2, lumpy: 0.18, crater: 0.0, land: 0, marble: 0.7 },
  void: { band: 0.0, crack: 0.18, turb: 0.2, atmo: 0.0, lumpy: 0.1, crater: 0.3, land: 0, marble: 0.15 },
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
  // multiplicative wobble: same temperament, never the same face
  const wob = (v: number, salt: number) => clamp01(v * (0.65 + 0.7 * j(salt)));

  // the third color: drawn between the two dreamed ones, then pulled to a
  // different hue — this is what makes worlds read as multi-colored
  const colorC = colorA
    .clone()
    .lerp(colorB, 0.3 + 0.4 * j(8))
    .offsetHSL((j(9) - 0.5) * 0.5, 0.1, 0.05);

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
    axis: new THREE.Vector3(
      1 + (j(10) - 0.5) * 0.55,
      1 + (j(11) - 0.5) * 0.55,
      1 + (j(12) - 0.5) * 0.55,
    ),
    spin: (j(13) < 0.5 ? -1 : 1) * (0.02 + 0.07 * j(14)),
    rings,
  };

  // rare temperament breaks, so the sky holds surprises: a world dreamed in
  // many colors at once, or one that is nearly all continent
  const wild = j(15);
  if (wild < 0.14) fp.marble = Math.max(fp.marble, 0.75);
  else if (wild > 0.9) fp.land = Math.max(fp.land, 0.85);

  return fp;
}

import * as THREE from "three";
import type { Planet, WorldForm } from "@shared/cosmos";
import { PALETTE } from "./palette";

// Every world's look: authored by the mind (form) or derived stably from its
// palette (older worlds). Archetypes map to shader parameters.

export type FormParams = {
  colorA: THREE.Color;
  colorB: THREE.Color;
  band: number; // latitude banding (gas giant)
  crack: number; // glowing veins
  turb: number; // noise turbulence
  atmo: number; // fresnel atmosphere shell
  rings: boolean;
};

const ARCH: Record<WorldForm["archetype"], { band: number; crack: number; turb: number; atmo: number }> = {
  ember: { band: 0.1, crack: 0.95, turb: 0.6, atmo: 0.15 },
  ocean: { band: 0.35, crack: 0.0, turb: 0.3, atmo: 0.55 },
  storm: { band: 0.95, crack: 0.0, turb: 0.85, atmo: 0.6 },
  ice: { band: 0.15, crack: 0.3, turb: 0.15, atmo: 0.35 },
  verdant: { band: 0.2, crack: 0.0, turb: 0.6, atmo: 0.45 },
  dust: { band: 0.55, crack: 0.0, turb: 0.25, atmo: 0.1 },
  crystal: { band: 0.0, crack: 0.75, turb: 0.95, atmo: 0.2 },
  void: { band: 0.0, crack: 0.18, turb: 0.2, atmo: 0.0 },
};

// stable fallback for worlds dreamed before forms existed
const PALETTE_ARCH: WorldForm["archetype"][] = ["ember", "ocean", "crystal", "verdant", "storm", "ice"];

export function formParams(seed: Planet): FormParams {
  if (seed.form) {
    const a = ARCH[seed.form.archetype];
    return {
      colorA: new THREE.Color(seed.form.colorA),
      colorB: new THREE.Color(seed.form.colorB),
      ...a,
      rings: seed.form.rings,
    };
  }
  const pal = PALETTE[seed.paletteIndex % PALETTE.length];
  const arch = PALETTE_ARCH[seed.paletteIndex % PALETTE_ARCH.length];
  return {
    colorA: pal.base.clone(),
    colorB: pal.halo.clone(),
    ...ARCH[arch],
    rings: false,
  };
}

import * as THREE from "three";

// Curated body palette. `emissive` is HDR (components > 1) so bloom picks it up;
// `halo` is the LDR tint for the additive glow sprite.

export type BodyPalette = {
  name: string;
  base: THREE.Color;
  emissive: THREE.Color;
  halo: THREE.Color;
};

export const PALETTE: BodyPalette[] = [
  { name: "ember", base: new THREE.Color("#3a1d12"), emissive: new THREE.Color(2.2, 0.85, 0.32), halo: new THREE.Color("#ff9a55") },
  { name: "teal", base: new THREE.Color("#0d2b2a"), emissive: new THREE.Color(0.38, 1.9, 1.65), halo: new THREE.Color("#5fe8d8") },
  { name: "violet", base: new THREE.Color("#221336"), emissive: new THREE.Color(1.35, 0.75, 2.4), halo: new THREE.Color("#b78cff") },
  { name: "rose", base: new THREE.Color("#331420"), emissive: new THREE.Color(2.3, 0.65, 1.0), halo: new THREE.Color("#ff7fae") },
  { name: "gold", base: new THREE.Color("#2f2410"), emissive: new THREE.Color(2.4, 1.75, 0.55), halo: new THREE.Color("#ffd98c") },
  { name: "ice", base: new THREE.Color("#141f2e"), emissive: new THREE.Color(0.75, 1.4, 2.6), halo: new THREE.Color("#9cc8ff") },
];

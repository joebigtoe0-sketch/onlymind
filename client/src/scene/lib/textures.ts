import * as THREE from "three";

// Procedural textures generated at boot — no external art dependency (§15).

let sharedGlow: THREE.CanvasTexture | null = null;

// Soft radial gradient used by every glow/halo/flash sprite (tinted per use).
export function getSharedGlowTexture(): THREE.CanvasTexture {
  if (sharedGlow) return sharedGlow;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.6)");
  g.addColorStop(0.42, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  sharedGlow = new THREE.CanvasTexture(c);
  return sharedGlow;
}

let sharedRing: THREE.CanvasTexture | null = null;

// Concentric translucent bands for dreamed ring systems (alphaMap, planar UV).
export function getRingTexture(): THREE.CanvasTexture {
  if (sharedRing) return sharedRing;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  const bands = [
    [0.62, 0.7, 0.5],
    [0.72, 0.78, 0.3],
    [0.8, 0.88, 0.55],
    [0.9, 0.97, 0.25],
  ];
  for (const [r0, r1, a] of bands) {
    const g = ctx.createRadialGradient(cx, cx, cx * r0, cx, cx, cx * r1);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${a})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  sharedRing = new THREE.CanvasTexture(c);
  return sharedRing;
}

// Grayscale nebula blotch, tinted by the sprite material. Deterministic per seed.
export function nebulaTexture(seed: number, size = 512): THREE.CanvasTexture {
  let s = seed >>> 0;
  const rnd = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "lighter";

  const centers = Array.from({ length: 3 }, () => ({
    x: size * (0.3 + 0.4 * rnd()),
    y: size * (0.3 + 0.4 * rnd()),
  }));
  for (let i = 0; i < 48; i++) {
    const cc = centers[i % centers.length];
    const x = cc.x + gauss() * size * 0.22;
    const y = cc.y + gauss() * size * 0.22;
    const r = size * (0.05 + 0.2 * rnd());
    const a = 0.03 + 0.09 * rnd();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // circular falloff so the sprite has no hard square edge
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
  mask.addColorStop(0, "rgba(255,255,255,1)");
  mask.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(c);
}

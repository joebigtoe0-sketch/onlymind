// GLSL for the three custom materials: planets, the starfield, and the
// ignition shockwave shell. Lighting is computed against the core at the
// origin — no three.js lights in the scene at all.

export const PLANET_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vObjPos;

void main() {
  vObjPos = position;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const PLANET_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uColB; // the second dreamed color: bands, veins, glow
uniform vec3 uEmissive;
uniform float uEmissiveMul;
uniform float uCoreLight;
uniform float uTime;
uniform float uSeed;
uniform float uHot;
uniform float uDead; // 0 alive .. 1 cold debris
uniform float uBand; // latitude banding
uniform float uCrack; // glowing veins
uniform float uTurb; // turbulence

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vObjPos;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(-vWorldPos); // the core sits at the origin

  // wrapped lambert lit by the core: soft terminator, day side toward origin
  float lam = pow(clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0), 1.5);

  // the surface as dreamed: banding stretches noise into latitudes, the
  // second color pools where the noise gathers, turbulence roughens it
  vec3 p = vObjPos;
  p.y *= 1.0 + uBand * 2.8;
  float n = fbm(p * (2.2 + uTurb * 2.6) + uSeed * 7.31);
  vec3 surf = mix(uBase, uColB * 0.5, smoothstep(0.3, 0.75, n));
  vec3 albedo = surf * (0.75 + 0.5 * n);
  vec3 col = albedo * (0.12 + 1.05 * lam * uCoreLight);

  // glowing veins (ember, crystal): ridged noise cracks lit from within
  float rn = abs(vnoise(vObjPos * (4.2 + uTurb * 3.0) + uSeed * 3.7) * 2.0 - 1.0);
  float vein = smoothstep(0.15, 0.02, rn) * uCrack;
  col += uColB * vein * (0.9 + 0.6 * sin(uTime * 0.9 + uSeed * 4.0));

  // the body glows from within; rim brighter (fresnel), breathing slowly
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
  float pulse = 0.85 + 0.15 * sin(uTime * 0.7 + uSeed * 6.28);
  col += uEmissive * uEmissiveMul * (0.20 + 0.55 * fres) * pulse;

  // newborn heat: freshly accreted worlds run hot, then cool into themselves
  col += uEmissive * uHot;

  // death: the dream went cold — desaturate, darken, a pale ash-blue remnant
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 ash = vec3(lum) * vec3(0.55, 0.62, 0.75) * 0.34 + vec3(0.010, 0.012, 0.018);
  col = mix(col, ash, uDead);

  gl_FragColor = vec4(col, 1.0);
}
`;

export const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aSpeed;
attribute vec3 aColor;

uniform float uTime;
uniform float uBirth;
uniform float uPixelRatio;

varying float vAlpha;
varying vec3 vColor;

void main() {
  // the first light expands outward: a star ignites when the front reaches it
  float dist = length(position);
  float front = uBirth * 60.0;
  float born = uBirth < 0.0 ? 0.0 : smoothstep(dist - 4.0, dist + 26.0, front);
  float tw = 0.7 + 0.3 * sin(uTime * aSpeed + aPhase);
  vAlpha = born * tw;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aSize * uPixelRatio * (160.0 / -mv.z), 26.0 * uPixelRatio);
  gl_Position = projectionMatrix * mv;
}
`;

export const STAR_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float glow = pow(smoothstep(1.0, 0.0, d), 2.0);
  float core = smoothstep(0.5, 0.0, d);
  float a = vAlpha * (glow * 0.7 + core * 0.6);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * (0.7 + core * 0.8), a);
}
`;

// The soul: a veil of light whose SILHOUETTE is wispy — vertices displaced by
// flowing noise into rising flame-tongues, shaded as a soft fresnel veil.
// Used by the mind-light (two layers) and, smaller, the holder-shards.

const NOISE_GLSL = /* glsl */ `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p *= 2.07;
    a *= 0.5;
  }
  return s;
}
`;

export const ENERGY_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uWobble;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vObjPos;

${NOISE_GLSL}

void main() {
  vObjPos = position;
  vec3 n = normalize(position);

  // the veil breathes: slow body swell + faster rising tongues, licking
  // upward more strongly above the equator — a flame that is not on fire
  float flow = fbm(n * 2.3 + vec3(0.0, -uTime * 0.55, 0.0) + uSeed);
  float tongues = fbm(n * 4.2 + vec3(0.0, -uTime * 1.05, 0.0) + uSeed * 2.0);
  float top = smoothstep(-0.4, 1.0, n.y);
  float disp = (flow - 0.45) * 0.55 + (tongues - 0.5) * 0.45 * top;
  vec3 displaced = position + n * disp * uWobble;
  displaced.y += top * top * uWobble * 0.5 * (tongues + 0.2);

  vNormal = normalize(mat3(modelMatrix) * n);
  vec4 wp = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const ENERGY_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vObjPos;

${NOISE_GLSL}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  // sharp fresnel: the face of the veil is nearly transparent, only the
  // silhouette edge carries light — gauze, not milk
  float fres = pow(1.0 - abs(dot(N, V)), 2.3);
  vec3 p = normalize(vObjPos);

  // soft streaks of light flowing upward through the veil
  float streaks = fbm(p * 3.1 + vec3(0.0, -uTime * 0.7, 0.0) + uSeed);
  float veil = 0.35 + 0.65 * smoothstep(0.3, 0.8, streaks);
  float top = smoothstep(-0.6, 0.9, p.y);

  vec3 col = uColor * fres * veil * (1.1 + top * 0.4) * uIntensity;
  col += uColor * pow(fres, 3.0) * 0.8 * uIntensity; // bright rim
  col += vec3(1.0) * pow(fres, 6.0) * 0.2 * uIntensity; // faint white edge

  float a = clamp(fres * veil, 0.0, 1.0) * 0.7;
  gl_FragColor = vec4(col, a);
}
`;

export const SHELL_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SHELL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;

varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  // limb-bright wavefront, visible from inside and outside the sphere
  vec3 V = normalize(cameraPosition - vWorldPos);
  float f = pow(1.0 - abs(dot(normalize(vNormal), V)), 3.0);
  gl_FragColor = vec4(uColor * f, f * uOpacity);
}
`;

// GLSL for the three custom materials: planets, the starfield, and the
// ignition shockwave shell. Lighting is computed against the core at the
// origin — no three.js lights in the scene at all.

// Planet vertices are displaced on the GPU: living worlds can be gently
// lumpy (uLumpy), and death (uDead) collapses the sphere into a cratered
// potato-shaped rock along uAxis. Normals are re-derived from the displaced
// surface by sampling two tangent neighbours.
export const PLANET_VERT = /* glsl */ `
uniform float uSeed;
uniform float uLumpy;
uniform float uDead;
uniform vec3 uAxis;

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

float surfDisp(vec3 n) {
  // alive: broad gentle unevenness — a world, not a marble
  float live = (fbm(n * 2.1 + uSeed * 3.1) - 0.5) * uLumpy;
  // dead: the rock the dream cooled into — ridges gouged by deep bites
  float rock = (fbm(n * 2.3 + uSeed * 5.7) - 0.5) * 0.52;
  float gouge = pow(vnoise(n * 3.4 + uSeed * 9.3), 2.0) * 0.38;
  return mix(live, rock - gouge, uDead);
}

vec3 shaped(vec3 n) {
  vec3 ax = mix(vec3(1.0), uAxis, uDead);
  return n * ax * (1.0 + surfDisp(n));
}

void main() {
  vec3 n = normalize(position);
  vObjPos = n;

  vec3 up = abs(n.y) < 0.98 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(up, n));
  vec3 b = cross(n, t);
  float e = 0.06;
  vec3 p0 = shaped(n);
  vec3 p1 = shaped(normalize(n + t * e));
  vec3 p2 = shaped(normalize(n + b * e));
  vec3 nrm = normalize(cross(p1 - p0, p2 - p0));

  vNormal = normalize(mat3(modelMatrix) * nrm);
  vec4 wp = modelMatrix * vec4(p0, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const PLANET_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uColB; // the second dreamed color: bands, veins, glow
uniform vec3 uColC; // the third color: continents, marbled folds
uniform vec3 uEmissive;
uniform float uEmissiveMul;
uniform float uCoreLight;
uniform float uTime;
uniform float uSeed;
uniform float uHot;
uniform float uDead; // 0 alive .. 1 cold cratered rock
uniform float uBand; // latitude banding
uniform float uCrack; // glowing veins
uniform float uTurb; // turbulence
uniform float uCrater; // impact craters on the living surface
uniform float uLand; // continents rising out of a base-color sea
uniform float uMarble; // domain-warped folds of all three colors

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

// sparse impact craters: some voronoi cells hold one, sized per cell.
// Returns (bowl, rim): shadowed floor and light-catching ridge.
vec2 craters(vec3 p, float density) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float bowl = 0.0;
  float rim = 0.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    if (hash(ip + g + 7.7) > density) continue;
    vec3 c = g + vec3(hash(ip + g), hash(ip + g + 17.1), hash(ip + g + 31.7)) - fp;
    float r = 0.30 + 0.22 * hash(ip + g + 3.3);
    float d = length(c) / r;
    bowl = max(bowl, 1.0 - smoothstep(0.5, 1.0, d));
    rim = max(rim, smoothstep(0.5, 0.8, d) * (1.0 - smoothstep(0.8, 1.2, d)));
  }
  return vec2(bowl, rim);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(-vWorldPos); // the core sits at the origin

  // wrapped lambert lit by the core: soft terminator, day side toward origin
  float lam = pow(clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0), 1.5);
  vec3 np = normalize(vObjPos);

  // the surface as dreamed: banding stretches noise into latitudes, the
  // second color pools where the noise gathers, turbulence roughens it
  vec3 p = np;
  p.y *= 1.0 + uBand * 2.8;
  float n = fbm(p * (2.2 + uTurb * 2.6) + uSeed * 7.31);
  vec3 surf = mix(uBase, uColB * 0.5, smoothstep(0.3, 0.75, n));

  // marbled worlds: the three colors fold through each other, storm-warped
  if (uMarble > 0.01) {
    float q = fbm(np * 1.7 + uSeed * 4.9);
    float m = fbm(np * (2.1 + uTurb * 1.4) + q * 2.6 + uSeed * 2.3);
    vec3 m1 = mix(uBase, uColB * 0.85, smoothstep(0.2, 0.5, m));
    vec3 tri = mix(m1, uColC, smoothstep(0.55, 0.82, m));
    surf = mix(surf, tri, uMarble);
  }

  // continents: the third color rises out of a base-color sea; the coast
  // between them holds a faint shore-glow of the second color
  if (uLand > 0.01) {
    float ln1 = fbm(np * 2.7 + uSeed * 11.0);
    float landM = smoothstep(0.50, 0.56, ln1);
    surf = mix(surf, uColC * 0.9, landM * uLand);
    float coast = smoothstep(0.465, 0.50, ln1) * (1.0 - smoothstep(0.56, 0.60, ln1));
    surf += uColB * coast * uLand * 0.5;
  }

  vec3 albedo = surf * (0.75 + 0.5 * n);

  // craters: living worlds by temperament, every dead one by history
  float craterAmt = max(uCrater, uDead * 0.9);
  vec2 cr = vec2(0.0);
  if (craterAmt > 0.02) {
    vec2 c1 = craters(np * 2.4 + uSeed * 13.0, 0.40);
    vec2 c2 = craters(np * 5.5 + uSeed * 29.0, 0.30);
    cr = max(c1, c2 * vec2(0.8, 0.6));
  }
  albedo *= 1.0 - cr.x * 0.42 * craterAmt;
  albedo += albedo * cr.y * 0.6 * craterAmt;

  vec3 col = albedo * (0.12 + 1.05 * lam * uCoreLight);

  // glowing veins (ember, crystal): ridged noise cracks lit from within
  float rn = abs(vnoise(np * (4.2 + uTurb * 3.0) + uSeed * 3.7) * 2.0 - 1.0);
  float vein = smoothstep(0.15, 0.02, rn) * uCrack;
  col += uColB * vein * (0.9 + 0.6 * sin(uTime * 0.9 + uSeed * 4.0));

  // the body glows from within; rim brighter (fresnel), breathing slowly
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
  float pulse = 0.85 + 0.15 * sin(uTime * 0.7 + uSeed * 6.28);
  col += uEmissive * uEmissiveMul * (0.20 + 0.55 * fres) * pulse;

  // newborn heat: freshly accreted worlds run hot, then cool into themselves
  col += uEmissive * uHot;

  // death: the dream cooled into rock. Grey-brown grain, crater-bitten,
  // keeping only a ghost-tint of the world it was.
  float grain = fbm(np * 7.0 + uSeed * 3.0);
  vec3 rockTint = mix(vec3(0.30, 0.26, 0.22), vec3(0.16, 0.17, 0.20), smoothstep(0.3, 0.7, grain));
  vec3 rock = (rockTint + uBase * 0.05) * (0.65 + 0.5 * grain);
  rock *= 1.0 - cr.x * 0.6;
  rock += rockTint * cr.y * 0.8;
  rock *= 0.10 + 0.95 * lam * uCoreLight;
  rock += vec3(0.010, 0.011, 0.014); // never fully swallowed by the dark
  col = mix(col, rock, uDead);

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

// Generates the SOLUS 3:1 banner. Deterministic — same seed, same sky, every run.
//   node brand/generate-banner.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const W = 1500;
const H = 500;

// The point everything came from. Right of centre, clear of the avatar corner.
const SRC = { x: 1105, y: 232 };

const SEED = 0x50415553; // "SOLUS"

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);

// Dreamed worlds. Density falls off with distance from the point, so the
// cosmos reads as having grown outward from it.
function field(count, { minR, maxR, minO, maxO, falloff }) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 400) {
    const x = rand() * W;
    const y = rand() * H;
    const d = Math.hypot(x - SRC.x, y - SRC.y);
    const p = Math.pow(Math.max(0.03, 1 - d / falloff), 1.6);
    if (rand() > p) continue;
    // Never crowd the corner the avatar sits in.
    if (x < 330 && y > 300) continue;
    out.push({
      x: +x.toFixed(1),
      y: +y.toFixed(1),
      r: +(minR + rand() * (maxR - minR)).toFixed(2),
      o: +(minO + rand() * (maxO - minO)).toFixed(3),
    });
  }
  return out;
}

const dust = field(190, { minR: 0.35, maxR: 1.05, minO: 0.06, maxO: 0.34, falloff: 1750 });
const worlds = field(7, { minR: 1.6, maxR: 2.5, minO: 0.4, maxO: 0.72, falloff: 1050 });

const shells = [
  { r: 96, w: 1.1, o: 0.2, f: 'soft' },
  { r: 208, w: 1.1, o: 0.125, f: 'soft' },
  { r: 352, w: 1.2, o: 0.075, f: 'far' },
  { r: 545, w: 1.3, o: 0.045, f: 'far' },
  { r: 800, w: 1.4, o: 0.026, f: 'far' },
];

const dot = (p, fill) =>
  `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${fill}" opacity="${p.o}"/>`;

function svg({ withText }) {
  const caption = withText
    ? `
  <text x="392" y="258"
        fill="#c8d6ee" opacity="0.42"
        font-family="'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
        font-size="21" font-weight="300" letter-spacing="6.2">AM I ALONE? IS ANYTHING REAL?</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="SOLUS">
  <defs>
    <radialGradient id="core" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="14%" stop-color="#e8efff" stop-opacity="0.42"/>
      <stop offset="40%" stop-color="#9fb4d8" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#9fb4d8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="wash" cx="${((SRC.x / W) * 100).toFixed(1)}%" cy="${((SRC.y / H) * 100).toFixed(1)}%" r="95%">
      <stop offset="0%" stop-color="#16203a" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="#0a0d18" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#05060a" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.5"/></filter>
    <filter id="far" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>

  <rect width="${W}" height="${H}" fill="#05060a"/>
  <rect width="${W}" height="${H}" fill="url(#wash)"/>

${shells.map((s) => `  <circle cx="${SRC.x}" cy="${SRC.y}" r="${s.r}" fill="none" stroke="#9fb4d8" stroke-width="${s.w}" opacity="${s.o}" filter="url(#${s.f})"/>`).join('\n')}

  <g>
${dust.map((p) => '    ' + dot(p, '#dce6f7')).join('\n')}
  </g>
  <g filter="url(#soft)">
${worlds.map((p) => '    ' + dot(p, '#ecf2ff')).join('\n')}
  </g>

  <circle cx="${SRC.x}" cy="${SRC.y}" r="150" fill="url(#core)"/>
  <circle cx="${SRC.x}" cy="${SRC.y}" r="3.4" fill="#ffffff"/>
${caption}
</svg>
`;
}

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'solus-banner.svg'), svg({ withText: true }));
writeFileSync(join(here, 'solus-banner-clean.svg'), svg({ withText: false }));
console.log('wrote solus-banner.svg and solus-banner-clean.svg');

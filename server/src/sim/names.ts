// Coined names — the mind's own sounds. Everything here used to come from
// one fixed list (Omm, Selu, Pib...), which meant every universe reached for
// the same handful of names and the same handful of jobs, and resets felt
// like reruns. Now names are minted fresh, and the fixed pools only flavor.

const OPEN = ["m", "n", "s", "v", "l", "r", "t", "k", "p", "d", "th", "sh", "f", "h", ""];
const VOWEL = ["a", "e", "i", "o", "u", "au", "ei", "ou", "aa", "ie"];
const END = ["", "", "n", "l", "r", "s", "m", "th", "d"];

export function coinName(): string {
  const syllables = 1 + (Math.random() < 0.75 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0);
  let s = "";
  for (let i = 0; i < syllables; i++) {
    s += OPEN[Math.floor(Math.random() * OPEN.length)];
    s += VOWEL[Math.floor(Math.random() * VOWEL.length)];
  }
  s += END[Math.floor(Math.random() * END.length)];
  if (s.length < 2) s += VOWEL[Math.floor(Math.random() * VOWEL.length)];
  return s[0].toUpperCase() + s.slice(1);
}

// small trades for small lives — no two universes lean on the same one
const TRADES = [
  "who keeps the low fires",
  "who reads the wind for the others",
  "who mends what the night loosens",
  "who counts the flickers",
  "who tends the seed-rows",
  "who walks the far markers",
  "who listens at the deep wells",
  "who trains the slow vines",
  "who grinds the warm stones",
  "who watches the second light",
  "who carries word between the hollows",
  "who salts the roofs before storms",
  "who wakes the herds",
  "who keeps the tally-cords",
  "who sings the fog down",
  "who sweeps the star-side paths",
];

export function coinTrade(): string {
  return TRADES[Math.floor(Math.random() * TRADES.length)];
}

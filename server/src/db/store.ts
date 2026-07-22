import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FocusState, Fragment, Mark, Planet, Thought } from "../../../shared/src/cosmos";

// The permanent record (§10, §13). WAL mode, synchronous prepared statements,
// write-through from the sim's mutators. Hot state stays in RAM; this file is
// the truth that survives restarts. (Lazy load by camera interest becomes
// relevant once the debris field grows into the thousands — the planets table
// is small enough to load whole for now.)

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database;

let dbPath = "";

export function initDb(): void {
  dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), "onlymind.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  db.prepare("INSERT OR IGNORE INTO mind (id) VALUES (1)").run();
  migrate();
  console.log(`[onlymind] archive at ${dbPath}`);
}

// additive migrations for archives created by earlier versions
function migrate(): void {
  const cols = (db.prepare("PRAGMA table_info(planets)").all() as Array<{ name: string }>).map(
    (r) => r.name,
  );
  if (!cols.includes("parent_id")) {
    db.exec("ALTER TABLE planets ADD COLUMN parent_id TEXT");
  }
  if (!cols.includes("form")) {
    db.exec("ALTER TABLE planets ADD COLUMN form TEXT");
  }
  const fcols = (db.prepare("PRAGMA table_info(fragments)").all() as Array<{ name: string }>).map(
    (r) => r.name,
  );
  if (!fcols.includes("kind")) {
    db.exec("ALTER TABLE fragments ADD COLUMN kind TEXT NOT NULL DEFAULT 'descent'");
  }
  if (!fcols.includes("gone_at")) {
    db.exec("ALTER TABLE fragments ADD COLUMN gone_at INTEGER");
  }
  if (!fcols.includes("wallet")) {
    db.exec("ALTER TABLE fragments ADD COLUMN wallet TEXT");
  }
  if (!fcols.includes("weight")) {
    db.exec("ALTER TABLE fragments ADD COLUMN weight REAL");
  }
  const trcols = (
    db.prepare("PRAGMA table_info(transmissions)").all() as Array<{ name: string }>
  ).map((r) => r.name);
  if (!trcols.includes("tweeted")) {
    db.exec("ALTER TABLE transmissions ADD COLUMN tweeted INTEGER NOT NULL DEFAULT 0");
  }
}

// full reset (§14): close and delete the archive; the process exits after
export function wipeDb(): void {
  try {
    db.close();
  } catch {
    /* already closed */
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      /* absent */
    }
  }
}

// ---- kv ---------------------------------------------------------------------

export function kvGet(key: string): string | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function kvSet(key: string, value: string): void {
  db.prepare(
    "INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

// ---- mind -------------------------------------------------------------------

export function saveMind(
  mood: number,
  focus: FocusState,
  belief?: number,
  certainty?: number,
): void {
  db.prepare(
    `UPDATE mind SET mood = ?, focus_phase = ?, focus_planet_id = ?, focus_since = ?,
       belief_in_outside = COALESCE(?, belief_in_outside),
       certainty_of_self = COALESCE(?, certainty_of_self)
     WHERE id = 1`,
  ).run(mood, focus.phase, focus.planetId, focus.sinceAt, belief ?? null, certainty ?? null);
}

export function loadMind(): {
  mood: number;
  focus: FocusState;
  belief: number;
  certainty: number;
} {
  const row = db.prepare("SELECT * FROM mind WHERE id = 1").get() as {
    mood: number;
    focus_phase: FocusState["phase"];
    focus_planet_id: string | null;
    focus_since: number;
    belief_in_outside: number;
    certainty_of_self: number;
  };
  return {
    mood: row.mood,
    focus: { phase: row.focus_phase, planetId: row.focus_planet_id, sinceAt: row.focus_since },
    belief: row.belief_in_outside,
    certainty: row.certainty_of_self,
  };
}

// ---- marks (§9): spectator-left traces --------------------------------------

export function insertMark(m: Mark): void {
  db.prepare("INSERT INTO marks (id, kind, payload, found, at) VALUES (?, 'word', ?, 0, ?)").run(
    m.id,
    m.word,
    m.at,
  );
}

export function markFound(id: string, foundAt: number): void {
  db.prepare("UPDATE marks SET found = ? WHERE id = ?").run(foundAt, id);
}

export function loadMarks(): Mark[] {
  const rows = db.prepare("SELECT * FROM marks ORDER BY at").all() as Array<{
    id: string;
    payload: string;
    found: number;
    at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    word: r.payload,
    at: r.at,
    foundAt: r.found > 0 ? r.found : null,
  }));
}

// ---- atlas (§10): the elegy for each dead world -----------------------------

export function insertElegy(planetId: string, diedAt: number, elegy: string, summary: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO atlas (planet_id, died_at, elegy, descent_summary) VALUES (?, ?, ?, ?)",
  ).run(planetId, diedAt, elegy, summary);
}

export function getElegy(planetId: string): string | null {
  const row = db.prepare("SELECT elegy FROM atlas WHERE planet_id = ?").get(planetId) as
    | { elegy: string }
    | undefined;
  return row?.elegy ?? null;
}

export function listTransmissions(n: number): Array<{ id: number; text: string; at: number; eventKind: string | null }> {
  const rows = db
    .prepare("SELECT id, text, at, event_kind FROM transmissions ORDER BY at DESC LIMIT ?")
    .all(n) as Array<{ id: number; text: string; at: number; event_kind: string | null }>;
  return rows.map((r) => ({ id: r.id, text: r.text, at: r.at, eventKind: r.event_kind }));
}

export function untweetedTransmissions(n: number): Array<{ id: number; text: string; at: number; eventKind: string | null }> {
  const rows = db
    .prepare("SELECT id, text, at, event_kind FROM transmissions WHERE tweeted = 0 ORDER BY at DESC LIMIT ?")
    .all(n) as Array<{ id: number; text: string; at: number; event_kind: string | null }>;
  return rows.map((r) => ({ id: r.id, text: r.text, at: r.at, eventKind: r.event_kind }));
}

export function markTweeted(id: number): void {
  db.prepare("UPDATE transmissions SET tweeted = 1 WHERE id = ?").run(id);
}

// ---- tweets: the composed outward posts (§11) -------------------------------

export function insertTweet(text: string, at: number, sourceKind: string | null): void {
  db.prepare("INSERT INTO tweets (text, at, source_kind) VALUES (?, ?, ?)").run(
    text,
    at,
    sourceKind,
  );
}

export function listTweets(n: number): Array<{ id: number; text: string; at: number; sourceKind: string | null }> {
  const rows = db
    .prepare("SELECT id, text, at, source_kind FROM tweets ORDER BY at DESC LIMIT ?")
    .all(n) as Array<{ id: number; text: string; at: number; source_kind: string | null }>;
  return rows.map((r) => ({ id: r.id, text: r.text, at: r.at, sourceKind: r.source_kind }));
}

// ---- planets ----------------------------------------------------------------

export function insertPlanet(p: Planet): void {
  db.prepare(
    `INSERT INTO planets (id, born_at, birth_thought, parent_id, form, orbit_radius, inclination,
       ascending_node, phase0, palette_index, target_mass, returns, alive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.id,
    p.bornAt,
    p.birthThought,
    p.parentId,
    p.form ? JSON.stringify(p.form) : null,
    p.orbitRadius,
    p.inclination,
    p.ascendingNode,
    p.phase0,
    p.paletteIndex,
    p.targetMass,
    p.returns,
    p.alive ? 1 : 0,
  );
}

export function updatePlanetAccretion(id: string, targetMass: number, returns: number): void {
  db.prepare("UPDATE planets SET target_mass = ?, returns = ? WHERE id = ?").run(
    targetMass,
    returns,
    id,
  );
}

type PlanetRow = {
  id: string;
  born_at: number;
  birth_thought: string | null;
  parent_id: string | null;
  form: string | null;
  orbit_radius: number;
  inclination: number;
  ascending_node: number;
  phase0: number;
  palette_index: number;
  target_mass: number;
  returns: number;
  alive: number;
  died_at: number | null;
};

function rowToPlanet(r: PlanetRow): Planet {
  let form = null;
  if (r.form) {
    try {
      form = JSON.parse(r.form);
    } catch {
      form = null;
    }
  }
  return {
    id: r.id,
    bornAt: r.born_at,
    birthThought: r.birth_thought,
    parentId: r.parent_id,
    form,
    orbitRadius: r.orbit_radius,
    inclination: r.inclination,
    ascendingNode: r.ascending_node,
    phase0: r.phase0,
    paletteIndex: r.palette_index,
    targetMass: r.target_mass,
    returns: r.returns,
    alive: r.alive === 1,
    diedAt: r.died_at,
  };
}

export function loadPlanets(): Planet[] {
  const rows = db.prepare("SELECT * FROM planets ORDER BY born_at").all() as PlanetRow[];
  return rows.map(rowToPlanet);
}

export function maxPlanetOrdinal(): number {
  const row = db
    .prepare("SELECT MAX(CAST(substr(id, 2) AS INTEGER)) AS n FROM planets")
    .get() as { n: number | null };
  return (row.n ?? -1) + 1;
}

// ---- thoughts ---------------------------------------------------------------

export function insertThought(t: Thought, depth = 0, fragmentId: string | null = null): void {
  db.prepare(
    "INSERT INTO thoughts (id, text, at, planet_id, depth, fragment_id) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(t.id, t.text, t.at, t.planetId, depth, fragmentId);
}

type ThoughtRow = { id: string; text: string; at: number; planet_id: string | null };

const toThought = (r: ThoughtRow): Thought => ({
  id: r.id,
  text: r.text,
  at: r.at,
  planetId: r.planet_id,
});

export function thoughtsForPlanet(planetId: string): Thought[] {
  const rows = db
    .prepare("SELECT id, text, at, planet_id FROM thoughts WHERE planet_id = ? ORDER BY at")
    .all(planetId) as ThoughtRow[];
  return rows.map(toThought);
}

export function recentThoughts(sinceAt: number): Thought[] {
  const rows = db
    .prepare("SELECT id, text, at, planet_id FROM thoughts WHERE at > ? ORDER BY at")
    .all(sinceAt) as ThoughtRow[];
  return rows.map(toThought);
}

export function countThoughts(): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM thoughts").get() as { n: number };
  return row.n;
}

export function lastThoughts(n: number): Thought[] {
  const rows = db
    .prepare("SELECT id, text, at, planet_id FROM thoughts ORDER BY at DESC LIMIT ?")
    .all(n) as ThoughtRow[];
  return rows.map(toThought).reverse();
}

// depth-scoped recall (§6): a fragment remembers only its depth's thoughts,
// and only since it came to be
export function lastThoughtsAtDepth(depth: number, sinceAt: number, n: number): Thought[] {
  const rows = db
    .prepare(
      "SELECT id, text, at, planet_id FROM thoughts WHERE depth = ? AND at >= ? ORDER BY at DESC LIMIT ?",
    )
    .all(depth, sinceAt, n) as ThoughtRow[];
  return rows.map(toThought).reverse();
}

// ---- fragments (the split tree, §7) -----------------------------------------

export function insertFragment(f: Fragment): void {
  db.prepare(
    "INSERT INTO fragments (id, planet_id, parent_id, depth, name, born_at, kind, wallet, weight) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    f.id,
    f.planetId,
    f.parentId,
    f.depth,
    f.name,
    f.bornAt,
    f.kind ?? "descent",
    f.wallet ?? null,
    f.weight ?? null,
  );
}

export function updateFragmentWeight(id: string, weight: number): void {
  db.prepare("UPDATE fragments SET weight = ? WHERE id = ?").run(weight, id);
}

type FragmentRow = {
  id: string;
  planet_id: string;
  parent_id: string | null;
  depth: number;
  name: string | null;
  born_at: number;
  kind: string;
  wallet: string | null;
  weight: number | null;
};

const rowToFragment = (r: FragmentRow): Fragment => ({
  id: r.id,
  planetId: r.planet_id,
  parentId: r.parent_id,
  depth: r.depth,
  name: r.name,
  bornAt: r.born_at,
  kind: r.kind === "dweller" ? "dweller" : "descent",
  wallet: r.wallet,
  weight: r.weight ?? undefined,
});

export function fragmentsForPlanet(planetId: string): Fragment[] {
  const rows = db
    .prepare("SELECT * FROM fragments WHERE planet_id = ? AND kind = 'descent' ORDER BY born_at")
    .all(planetId) as FragmentRow[];
  return rows.map(rowToFragment);
}

export function loadDwellers(): Fragment[] {
  const rows = db
    .prepare("SELECT * FROM fragments WHERE kind = 'dweller' AND gone_at IS NULL ORDER BY born_at")
    .all() as FragmentRow[];
  return rows.map(rowToFragment);
}

export function retireDweller(id: string, at: number): void {
  db.prepare("UPDATE fragments SET gone_at = ? WHERE id = ?").run(at, id);
}

export function maxFragmentOrdinal(): number {
  const row = db
    .prepare("SELECT MAX(CAST(substr(id, 2) AS INTEGER)) AS n FROM fragments")
    .get() as { n: number | null };
  return (row.n ?? -1) + 1;
}

export function markPlanetDead(id: string, diedAt: number): void {
  db.prepare("UPDATE planets SET alive = 0, died_at = ? WHERE id = ?").run(diedAt, id);
}

// ---- transmissions (the outward voice queue — real cadence in Slice 10) -----

export function insertTransmission(text: string, at: number, eventKind: string): void {
  db.prepare("INSERT INTO transmissions (text, at, event_kind) VALUES (?, ?, ?)").run(
    text,
    at,
    eventKind,
  );
}

export function maxThoughtOrdinal(): number {
  const row = db
    .prepare("SELECT MAX(CAST(substr(id, 2) AS INTEGER)) AS n FROM thoughts")
    .get() as { n: number | null };
  return (row.n ?? -1) + 1;
}

// ---- lessons (mind_memory): what the dreams have taught it ------------------

export function insertLesson(content: string, at: number): void {
  db.prepare("INSERT INTO mind_memory (depth, kind, content, at) VALUES (0, 'lesson', ?, ?)").run(
    content,
    at,
  );
}

export function lastLessons(n: number): string[] {
  const rows = db
    .prepare("SELECT content FROM mind_memory WHERE kind = 'lesson' ORDER BY at DESC LIMIT ?")
    .all(n) as Array<{ content: string }>;
  return rows.map((r) => r.content).reverse();
}

// ---- visions ----------------------------------------------------------------

export function insertVision(v: { id: string; planetId: string; text: string; url: string; at: number }): void {
  db.prepare("INSERT INTO visions (id, planet_id, text, url, at) VALUES (?, ?, ?, ?, ?)").run(
    v.id,
    v.planetId,
    v.text,
    v.url,
    v.at,
  );
}

export function visionsForPlanet(planetId: string): Array<{ id: string; planetId: string; text: string; url: string; at: number }> {
  const rows = db
    .prepare("SELECT id, planet_id, text, url, at FROM visions WHERE planet_id = ? ORDER BY at")
    .all(planetId) as Array<{ id: string; planet_id: string; text: string; url: string; at: number }>;
  return rows.map((r) => ({ id: r.id, planetId: r.planet_id, text: r.text, url: r.url, at: r.at }));
}

export function maxVisionOrdinal(): number {
  const row = db
    .prepare("SELECT MAX(CAST(substr(id, 2) AS INTEGER)) AS n FROM visions")
    .get() as { n: number | null };
  return (row.n ?? -1) + 1;
}

// ---- events -----------------------------------------------------------------

export function insertEvent(kind: string, at: number, payload: unknown): void {
  db.prepare("INSERT INTO events (kind, at, payload) VALUES (?, ?, ?)").run(
    kind,
    at,
    JSON.stringify(payload),
  );
}

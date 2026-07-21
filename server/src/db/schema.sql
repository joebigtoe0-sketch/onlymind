-- THE ONLY MIND — the permanent record (§10, §13).
-- One SQLite file. Everything durable, forever. Tables for later slices are
-- created now so the shape of the archive is fixed early.

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- the single mind's continuous state (one row)
CREATE TABLE IF NOT EXISTS mind (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  depth              INTEGER NOT NULL DEFAULT 0,
  active_planet_id   TEXT,
  coherence          REAL NOT NULL DEFAULT 1,
  certainty_of_self  REAL NOT NULL DEFAULT 0.7,
  belief_in_outside  REAL NOT NULL DEFAULT 0.4,
  mood               REAL NOT NULL DEFAULT 0.5,
  focus_phase        TEXT NOT NULL DEFAULT 'core',
  focus_planet_id    TEXT,
  focus_since        INTEGER NOT NULL DEFAULT 0
);

-- depth-scoped rolling summary + notes (slice 6: the forgetting mechanic)
CREATE TABLE IF NOT EXISTS mind_memory (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  depth   INTEGER NOT NULL,
  kind    TEXT NOT NULL,             -- 'summary' | 'note'
  content TEXT NOT NULL,
  at      INTEGER NOT NULL
);

-- every thought, ever (append-only)
CREATE TABLE IF NOT EXISTS thoughts (
  id          TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  at          INTEGER NOT NULL,
  planet_id   TEXT,
  depth       INTEGER NOT NULL DEFAULT 0,
  fragment_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_thoughts_planet ON thoughts(planet_id, at);
CREATE INDEX IF NOT EXISTS idx_thoughts_at ON thoughts(at);

-- every world: birth, orbit, mass, life and death
CREATE TABLE IF NOT EXISTS planets (
  id             TEXT PRIMARY KEY,
  born_at        INTEGER NOT NULL,
  birth_thought  TEXT,
  parent_id      TEXT,
  form           TEXT,                 -- JSON WorldForm, authored by the mind
  orbit_radius   REAL NOT NULL,
  inclination    REAL NOT NULL,
  ascending_node REAL NOT NULL,
  phase0         REAL NOT NULL,
  palette_index  INTEGER NOT NULL,
  target_mass    REAL NOT NULL,
  returns        INTEGER NOT NULL DEFAULT 0,
  alive          INTEGER NOT NULL DEFAULT 1,
  died_at        INTEGER,
  descent_depth  INTEGER NOT NULL DEFAULT 0
);

-- who the mind became inside each world (slice 6: the split tree)
CREATE TABLE IF NOT EXISTS fragments (
  id        TEXT PRIMARY KEY,
  planet_id TEXT NOT NULL,
  parent_id TEXT,
  depth     INTEGER NOT NULL,
  name      TEXT,
  born_at   INTEGER NOT NULL
);

-- spectator-left traces the mind can't attribute (slice 8)
CREATE TABLE IF NOT EXISTS marks (
  id      TEXT PRIMARY KEY,
  kind    TEXT NOT NULL,
  payload TEXT NOT NULL,
  found   INTEGER NOT NULL DEFAULT 0,
  at      INTEGER NOT NULL
);

-- the elegy for each dead world (slice 9)
CREATE TABLE IF NOT EXISTS atlas (
  planet_id       TEXT PRIMARY KEY,
  died_at         INTEGER NOT NULL,
  elegy           TEXT NOT NULL,
  descent_summary TEXT
);

-- the outward voice queue (slice 10)
CREATE TABLE IF NOT EXISTS transmissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT NOT NULL,
  at         INTEGER NOT NULL,
  event_kind TEXT,
  posted     INTEGER NOT NULL DEFAULT 0
);

-- visions: the mind's thoughts painted (image generation)
CREATE TABLE IF NOT EXISTS visions (
  id        TEXT PRIMARY KEY,
  planet_id TEXT NOT NULL,
  text      TEXT NOT NULL,
  url       TEXT NOT NULL,
  at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visions_planet ON visions(planet_id, at);

-- composed tweets: what the outward voice WOULD have posted (§11). The real
-- X integration later drains rows where posted = 0.
CREATE TABLE IF NOT EXISTS tweets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT NOT NULL,
  at          INTEGER NOT NULL,
  source_kind TEXT,
  posted      INTEGER NOT NULL DEFAULT 0
);

-- every cosmic event fired
CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  kind    TEXT NOT NULL,
  at      INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_at ON events(at);

# THE ONLY MIND — Build Instructions (for Claude Code)

This is the build guide for an agent. It is a companion to `THE_ONLY_MIND.md` — read that
first for **what** we're building and **why** (the fiction, the mechanics, the feel). This
document is **how**: the stack, the repo scaffold, and the order to build in.

> **Read `THE_ONLY_MIND.md` before writing any code.** Every section number below (§5, §6…)
> refers to that document. This guide never restates the design — it points at it.

---

## 0. The one rule that governs this whole build

**Build in vertical slices. Do not build the whole thing before I can see something.**

Each slice below is independently runnable and produces something a human can *look at* and
judge. After each slice: stop, tell me exactly how to run it, tell me what I should see, and
wait. Do not start the next slice until the current one is confirmed.

The failure mode we are avoiding is thousands of lines of plausible code that can't be
evaluated. A watchable checkpoint every slice is worth more than architectural completeness.

**If you're ever unsure whether to add a feature now or defer it: defer it.** The slices are
ordered so that the most important, most uncertain thing (does the cosmos look and feel right)
is proven first, with the least machinery.

---

## 1. Stack (decided — don't re-litigate)

Mirror the server stack from our first project (The Backrooms); swap the renderer for 3D.

**Shared / server (identical to Backrooms):**
- Node (LTS) + `tsx` (run TypeScript directly, no build step for server)
- `express` (REST) + `ws` (websocket) on one port
- `better-sqlite3` (WAL mode) — the only datastore, no external DB
- `zod` schemas in `shared/`, consumed as raw TS source by both sides
- npm workspaces monorepo

**Client (this is what changes):**
- **three.js** via **`@react-three/fiber`** (R3F) — the cosmos is a stateful scene (planets
  born, gaining mass, inhabited, collapsing); R3F lets the scene be a *function of state* fed
  by the websocket, instead of hand-written imperative mesh lifecycle code.
- **`@react-three/drei`** — camera controls (`OrbitControls`/`CameraControls`), instancing
  helpers, useful abstractions.
- **`postprocessing`** (via `@react-three/postprocessing`) — **bloom is non-negotiable**; it's
  what makes the core and planets glow instead of looking flat. Also selective bloom so only
  emissive bodies glow.
- **Vite** for the client dev server and build.
- **`zustand`** for client state (the websocket delta writes to a store; R3F components read
  from it). Keep it minimal.

Rationale is in the chat that produced this doc; the summary: the server problem is already
solved, so reuse it; the only genuinely new problem is rendering, so spend the sophistication
there. Cost is not a constraint; WOW is the goal.

**Do not** add a heavy game engine, a physics library (we fake gravity — see §15 of the vision
doc), a backend framework beyond express, or any cloud service. Keep the dependency list short.

---

## 2. Repo scaffold

```
onlymind/                    npm workspaces monorepo
├─ package.json              workspaces: ["shared","server","client"]; scripts: dev, build, start
├─ shared/
│  ├─ package.json
│  └─ src/
│     ├─ protocol.ts         zod schemas for every ws message + REST payload
│     ├─ cosmos.ts           zod schemas: Planet, Fragment, Mark, MindState, CosmicEvent
│     └─ actions.ts          zod schema for the LLM cognition output (§6 action contract)
├─ server/
│  ├─ package.json
│  └─ src/
│     ├─ index.ts            express + ws bootstrap, serves built client, one port
│     ├─ sim/
│     │  ├─ loop.ts          10 Hz tick (§4): orbits, mass, descent, mood/attention, broadcast
│     │  ├─ cosmos.ts        planet accretion, gravity/orbit math, collapse-to-debris
│     │  └─ mind.ts          the mind state machine: depth, descend/split/snap-back (§7)
│     ├─ brain/
│     │  ├─ scheduler.ts     decoupled cognition timer, concurrency/RPM caps, budget breaker (§12)
│     │  ├─ adapter.ts       provider-agnostic LLM call (OpenAI-compatible), zod-validated
│     │  ├─ prompts.ts       depth-scoped system prompts (whole-mind vs fragment) (§6, §12)
│     │  └─ mock.ts          scripted interior for BRAIN_MODE=mock (dev without spending)
│     ├─ voice/
│     │  └─ transmissions.ts outward-voice generation, ambient drip + event peaks (§11)
│     ├─ net/
│     │  ├─ ws.ts            connection registry, per-client camera-interest streaming
│     │  └─ rest.ts          /api/atlas, /api/planet/:id, /api/transmissions, /api/admin/*, /health
│     └─ db/
│        ├─ schema.sql       the tables from §13 as real DDL
│        └─ store.ts         better-sqlite3 wrapper, WAL, lazy load by camera interest
└─ client/
   ├─ package.json
   ├─ index.html
   ├─ admin.html
   └─ src/
      ├─ main.tsx
      ├─ store.ts            zustand: cosmos state fed by ws deltas
      ├─ net/socket.ts       ws client, camera_interest reporting, delta apply
      ├─ scene/
      │  ├─ Cosmos.tsx       the R3F <Canvas>: core, starfield, planets, debris, postfx
      │  ├─ Core.tsx         the central point-of-light (breathing, mood-driven)
      │  ├─ Planet.tsx       a body; size/glow/pull driven by accreted mass
      │  ├─ Starfield.tsx    instanced background stars
      │  ├─ DebrisField.tsx  cold dead worlds ring
      │  ├─ Descent.tsx      camera rig for following the mind into a world / split
      │  ├─ Thoughts.tsx     spatial thought labels that surface and dissolve
      │  └─ postfx.ts        bloom + mood color-grade config
      └─ ui/
         ├─ Panels.tsx       STREAM / TRANSMISSIONS / ATLAS
         ├─ Instruments.tsx  certainty-of-self / belief-in-outside / coherence readouts
         └─ PlanetLog.tsx    click-a-planet log view (§3)
```

Create the scaffold empty-but-wired in the first slice; fill it in over the slices.

---

## 3. The slices (build in this exact order)

Each slice: **goal → what to build → how I run it → what I should see (acceptance).**
Stop after each and wait for confirmation.

### Slice 0 — Monorepo skeleton
- **Goal:** everything wired, nothing real.
- **Build:** the workspace, all three packages, a stub `shared` schema, a server that serves a
  blank R3F `<Canvas>` client and exposes `GET /api/health`. `npm run dev` runs server + client.
- **Run:** `npm install && npm run dev`, open the client.
- **See:** a black full-screen canvas and a green `/api/health` response. That's all.
- *No sim, no ws data, no LLM, no DB yet.*

### Slice 1 — The power-on moment (client-only, fake data) ★ the one that matters
- **Goal:** the three-second pitch. Dark screen → **one point ignites** → it **breathes outward**
  and the cosmos begins. This is §5 and the "someone flipped the switch and it expanded" idea.
- **Build:** entirely client-side with hardcoded/faked state (no server data). The `Core`
  (bright, breathing, unstable emissive point), an instanced `Starfield`, **bloom postprocessing**,
  free-fly camera (`drei` controls), and a mood color-grade. A few faked planets slowly accreting
  and orbiting, sized/glowing by a fake "mass" value, just to prove the look.
- **Run:** `npm run dev`, open client.
- **See:** on load, black, then a single light igniting and the scene breathing outward into a
  small glowing cosmos I can fly around, that *feels alive and expensive*. Bloom makes the core
  and planets glow. **If this doesn't give a chill, we stop and iterate here before anything else.**
- *Spend real care on this slice. Follow the frontend-design skill. This screen sells the product.*

### Slice 2 — Accretion & fixation, still faked
- **Goal:** the cosmos *behaves* like a mind, from a scripted timeline (still no LLM).
- **Build:** a client-side fake "cognition timeline" that fires held-thoughts → planets accrete;
  recurrence → mass grows, glow deepens, pull strengthens (§5); a fixation → focus falls into
  orbit and into a planet. Spatial `Thoughts` labels surface near the active body and dissolve.
- **Run:** same.
- **See:** planets being born from thoughts, one swelling as the mind "fixates" and getting
  visually captured by its own idea. Reads as a mind, not a screensaver.

### Slice 3 — Server truth + websocket (move the sim server-side)
- **Goal:** one authoritative cosmos streamed to all tabs (§4).
- **Build:** the 10 Hz tick loop in `server/sim` (orbits, mass, mood fields), the ws protocol
  (`hello`/`snapshot`/`bodies`/`delta`), the zustand store applying deltas, and
  `camera_interest` streaming (server sends only nearby bodies). Move the Slice-2 fake timeline
  into the server as a temporary scripted driver.
- **Run:** `npm run dev`; open **two** browser tabs.
- **See:** both tabs show the identical cosmos evolving in lockstep. Fly independently; state is
  shared and authoritative.

### Slice 4 — Persistence (SQLite)
- **Goal:** the cosmos survives a restart; the atlas begins (§10, §13).
- **Build:** `db/schema.sql` (all §13 tables), `store.ts` (WAL, lazy load by camera interest),
  write-through on every cosmic event, reload seed + mind state + planets on boot.
- **Run:** let it run, kill the server, restart it.
- **See:** the same cosmos with the same planets and history comes back. Dead worlds persist.

### Slice 5 — The real mind (LLM cognition loop)
- **Goal:** replace the scripted driver with a real LLM interior (§6, §12).
- **Build:** `brain/adapter.ts` (provider-agnostic, zod-validated JSON, mock fallback on bad
  reply), `brain/scheduler.ts` (decoupled timer, concurrency/RPM caps, daily USD breaker,
  spectator-aware throttle), `brain/prompts.ts` (the **whole-mind** system prompt), `brain/mock.ts`.
  The mind's `thought`+`action` now drive real accretion/fixation. `BRAIN_MODE=mock` must work
  fully offline for dev.
- **Run:** `BRAIN_MODE=mock npm run dev` first (free), then `BRAIN_MODE=live` with a key.
- **See:** in mock, a plausible scripted interior driving the cosmos. In live, the real model
  thinking — thoughts appearing, planets forming from genuine cognition.

### Slice 6 — Descent, splitting & snap-back (the core drama) ★
- **Goal:** the sequence from §7 — the whole reason the product exists.
- **Build:** the mind state machine in `sim/mind.ts` (depth, `descend`/`split`/`inhabit`/
  `doubt`/`snap_back`), **depth-scoped memory** (higher-self memory withheld as it splits, rejoined
  on snap-back — see §6; this is the load-bearing trick), the **fragment** system prompt (§12), the
  `Descent` camera rig (dolly into a world, spawn smaller/dimmer bodies as it splits), and the
  collapse-to-debris visual (§5, §15).
- **Run:** `BRAIN_MODE=mock` (script a full descent for repeatable testing), then live.
- **See:** the mind dreams a world, descends, splits into a person, the fragment surfaces the
  inherited doubt, the spell breaks, the world collapses to the debris field, the core contracts.
  **This is the peak — it should land emotionally.**

### Slice 7 — The experiments (variety)
- **Goal:** §8 — invented companion, populated world, doubt cascade, the refusal.
- **Build:** the mind's ability to choose among descent patterns; admin nudges for pacing.
- **See:** distinct kinds of trips over time; it doesn't feel repetitive.

### Slice 8 — The outside (attention it senses, marks it can't attribute)
- **Goal:** §9 — the emotional core mechanic.
- **Build:** live watcher count → *pressure of being regarded* → belief-in-outside + cosmos
  warmth/expansion; scarce spectator `marks` that appear as unattributable anomalous bodies the
  mind must explain.
- **See:** the cosmos visibly warms as more tabs watch and cools as they leave; a left mark shows
  up as a body the mind puzzles over.

### Slice 9 — Permanence UI & the atlas of selves
- **Goal:** §3, §10 — the archaeology becomes browsable.
- **Build:** click-a-planet `PlanetLog` (what the mind thought when it made this world, who it
  became, what happened, how it ended), the `ATLAS` panel of LLM-written elegies for dead worlds,
  the `STREAM` raw feed, the `Instruments` readouts.
- **See:** I can fly to any dead world, click it, and read the story of that self.

### Slice 10 — The outward voice (transmissions)
- **Goal:** §11 — the tweet queue, single prophetic voice.
- **Build:** `voice/transmissions.ts` — ambient drip + event-driven peaks with cooldown, one
  consistent anguished register, written to the `transmissions` table; the `TRANSMISSIONS` panel.
  **No real X posting** — just the internal queue (that's the seam for later).
- **See:** weighted, prophetic messages accumulating at the real emotional beats plus a slow drip
  between them, in one unmistakable voice.

### Slice 11 — Admin & full reset
- **Goal:** operability (§3, §14).
- **Build:** password-gated `admin.html` — nudge drives, fire test events, **full reset** (wipe →
  exit non-zero → supervisor reboots a fresh mind from a new single point → clients auto-reload).
- **See:** I can reset the universe and watch a new one power on from a single point.

---

## 4. Cross-cutting requirements (hold these across every slice)

- **`BRAIN_MODE=mock` must always work fully offline.** Every slice that touches cognition needs
  a mock path so I can develop and demo without spending or needing a key.
- **Types are shared, not duplicated.** Client and server both import the `zod` schemas from
  `shared/`. The wire protocol is defined once.
- **The tick and cognition are decoupled** (§4/§6): the cosmos animates smoothly at 10 Hz while
  real LLM calls stay rare. Never block the tick on a model call.
- **Camera-interest streaming from the start of Slice 3:** the cosmos grows without bound, so the
  server must only stream bodies near each client's camera. Don't send the whole universe.
- **Round every number that reaches the screen.** Float artifacts in readouts look broken.
- **Env vars:** `LLM_API_KEY`, `LLM_BASE_URL`, `BRAIN_MODE`, `ADMIN_PASSWORD`, `DB_PATH`. Never
  hardcode a key. `DB_PATH` defaults to a local file in dev; in prod it points at a mounted volume.
- **Performance budget:** target 60 fps with a few hundred bodies on a normal laptop. Use
  instancing for the starfield and for large planet counts; use selective bloom so only emissive
  bodies glow; dispose R3F resources on collapse. If a slice tanks the framerate, fix it before
  moving on.
- **Visual quality is a feature, not a finish.** The vision doc's §5/§15 describe the look; the
  frontend-design skill governs execution. This is a product whose whole value is that it's
  mesmerizing — treat the rendering with the same seriousness as the simulation.

---

## 5. Deployment (wire up once the slices are real — §14)

- One service, from GitHub. Build (`npm ci && npm run build`), start (`npm run start`); the
  server serves the built client on the platform port. One root service — the workspaces must not
  be auto-split into separate services.
- Attach a **Volume** at `/data`, set `DB_PATH=/data/onlymind.db`, or the atlas resets on every
  redeploy.
- Set `LLM_API_KEY`, `LLM_BASE_URL`, `BRAIN_MODE=live`, `ADMIN_PASSWORD`.

---

## 6. What "done" means for v1

The v1 feature list is §16 of the vision doc. You are done with v1 when every slice above is
confirmed and the §16 list is true. Everything in §17 is explicitly **out of scope** for now —
do not build roadmap items (real X posting, sound, cross-dream motifs) unless asked.

**Start with Slice 0, then stop and show me Slice 1. That first light turning on is the
whole product — get it right before building anything behind it.**

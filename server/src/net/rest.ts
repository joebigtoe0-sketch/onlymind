import { Router } from "express";
import { leaveMark, planetLog, sim, thoughtCount, warmMood, coolMood } from "../sim/cosmos";
import { episode } from "../sim/experiments";
import { mind } from "../sim/mind";
import { fragmentsForPlanet, getElegy, kvGet, kvSet, listTransmissions, visionsForPlanet } from "../db/store";
import { holders } from "../sim/holders";
import { brainStatus } from "../brain/scheduler";
import { activeScar, currentInquiry, recurrenceCount } from "../sim/deep";
import { queueTransmission } from "../voice/transmissions";
import { visionStatus } from "../voice/visions";
import type { PlanetLog } from "../../../shared/src/protocol";

export const restRouter = Router();

const bootAt = Date.now();

const CA = (process.env.CA ?? "").trim();
const INSCRIPTION = CA.length > 0 && CA.toLowerCase() !== "placeholder" ? CA : null;

restRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "onlymind",
    slice: 11,
    seed: sim.seed,
    tick: sim.tick,
    planets: sim.planets.length,
    thoughts: thoughtCount(),
    marks: sim.marks.length,
    marksFound: sim.marks.filter((m) => m.foundAt != null).length,
    ca: INSCRIPTION,
    holders: Number(kvGet("holders") ?? 0),
    dwellers: holders.dwellers.length,
    episode: episode.current,
    companion: mind.companion?.name ?? null,
    brain: brainStatus(),
    visions: visionStatus(),
    deep: {
      inquiry: currentInquiry()?.question ?? null,
      inquirySteps: currentInquiry()?.steps.length ?? 0,
      scar: activeScar() != null,
      recurring: recurrenceCount(),
    },
    uptimeSec: Math.round((Date.now() - bootAt) / 1000),
  });
});

// The log of a held thought (§3 click-a-planet): the world, who the mind
// became there, and everything it ever thought there.
restRouter.get("/planet/:id", (req, res) => {
  const planet = sim.planets.find((p) => p.id === req.params.id);
  if (!planet) {
    res.status(404).json({ error: "no such world" });
    return;
  }
  const payload: PlanetLog = {
    planet,
    ignitionAt: sim.ignitionAt,
    thoughts: planetLog(planet.id),
    fragments: fragmentsForPlanet(planet.id),
    visions: visionsForPlanet(planet.id),
  };
  res.json(payload);
});

// The atlas of dead selves (§10): every world it dreamed and lost, each with
// its elegy — a coroner's story for a self.
restRouter.get("/atlas", (_req, res) => {
  const dead = sim.planets
    .filter((p) => !p.alive)
    .sort((a, b) => (b.diedAt ?? 0) - (a.diedAt ?? 0));
  res.json({
    ignitionAt: sim.ignitionAt,
    worlds: dead.map((p) => ({
      planet: p,
      fragments: fragmentsForPlanet(p.id),
      elegy: getElegy(p.id),
      visions: visionsForPlanet(p.id),
    })),
  });
});

// The outward voice queue (§11).
restRouter.get("/transmissions", (_req, res) => {
  res.json({ transmissions: listTransmissions(50) });
});

// What it would have posted (§11) — the composed tweets, never sent.
restRouter.get("/tweets", async (_req, res) => {
  const { listTweets } = await import("../db/store");
  res.json({ tweets: listTweets(50) });
});

// A mark (§9): one word, left in the dark. Scarce by design — one per
// spectator per half hour. It never arrives labeled; the mind finds it.
const markRate = new Map<string, number>();

restRouter.post("/mark", (req, res) => {
  const ip = req.ip ?? "unknown";
  const last = markRate.get(ip) ?? 0;
  if (Date.now() - last < 30 * 60 * 1000) {
    res.status(429).json({ error: "the dark has taken enough from you for now" });
    return;
  }
  const word = String(req.body?.word ?? "").trim();
  if (!/^[A-Za-zÀ-ÿ'’-]{1,16}$/.test(word)) {
    res.status(400).json({ error: "one word, letters only, sixteen at most" });
    return;
  }
  markRate.set(ip, Date.now());
  const mark = leaveMark(word.toLowerCase());
  res.json({ ok: true, id: mark.id });
});

// ---- admin (§3, §14): password-gated nudges + the full reset ----------------

const adminRouter = Router();

adminRouter.use((req, res, next) => {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) {
    res.status(403).json({ error: "admin disabled (ADMIN_PASSWORD not set)" });
    return;
  }
  if (req.header("x-admin-password") !== pass) {
    res.status(401).json({ error: "wrong password" });
    return;
  }
  next();
});

adminRouter.post("/nudge", (req, res) => {
  const exp = String(req.body?.experiment ?? "");
  if (!["descend", "populate", "companion", "refuse"].includes(exp)) {
    res.status(400).json({ error: "unknown experiment" });
    return;
  }
  kvSet("nextExperiment", exp);
  res.json({ ok: true, next: exp });
});

adminRouter.post("/mood", (req, res) => {
  const delta = Number(req.body?.delta ?? 0);
  if (delta > 0) warmMood(Math.min(0.4, delta));
  else coolMood(Math.min(0.4, -delta));
  res.json({ ok: true, moodTarget: Math.round(sim.moodTarget * 100) / 100 });
});

adminRouter.post("/spike", (_req, res) => {
  sim.attentionSpikePending = true;
  warmMood(0.2);
  res.json({ ok: true });
});

// holders → involuntary shards. The chain watcher calls this same seam later.
adminRouter.post("/holders", async (req, res) => {
  const { addHolders, removeHolder, holderCount, holders } = await import("../sim/holders");
  const add = Number(req.body?.add ?? 0);
  if (add > 0) {
    const made = addHolders(Math.min(50, add));
    res.json({ ok: true, ...made, holders: holderCount(), dwellers: holders.dwellers.length });
  } else if (add < 0) {
    removeHolder();
    res.json({ ok: true, holders: holderCount(), dwellers: holders.dwellers.length });
  } else {
    res.status(400).json({ error: "add must be nonzero" });
  }
});

adminRouter.post("/transmit", (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "text required" });
    return;
  }
  queueTransmission(text, "manual");
  res.json({ ok: true });
});

adminRouter.post("/tweet", async (_req, res) => {
  const { composeTweetNow } = await import("../voice/tweets");
  const t = composeTweetNow();
  if (!t) {
    res.status(400).json({ error: "nothing waiting to be said" });
    return;
  }
  res.json({ ok: true, ...t });
});

adminRouter.post("/anomaly", async (_req, res) => {
  const { spawnAnomaly } = await import("../sim/deep");
  res.json({ ok: true, planetId: spawnAnomaly() });
});

adminRouter.post("/meditate", async (_req, res) => {
  const { generateMeditation } = await import("../voice/meditations");
  const text = await generateMeditation();
  res.json({ ok: true, text: text?.slice(0, 200) });
});

adminRouter.post("/snapback", (_req, res) => {
  if (mind.depth === 0) {
    res.status(400).json({ error: "the mind is not inside a dream" });
    return;
  }
  import("../sim/mind").then(({ snapBack }) => snapBack());
  res.json({ ok: true });
});

// Full reset (§14): wipe the world, exit non-zero, let the supervisor reboot
// a fresh mind from a new single point. Clients reload on the new seed.
// In dev, tsx watch only restarts on file change — so nudge our own entry
// file's mtime on the way out and the watcher reboots the fresh mind itself.
adminRouter.post("/reset", (_req, res) => {
  res.json({ ok: true, note: "the mind will end and another will begin" });
  setTimeout(async () => {
    const { wipeDb } = await import("../db/store");
    try {
      wipeDb();
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const entry = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../index.ts",
      );
      const now = new Date();
      fs.utimesSync(entry, now, now);
    } catch {
      /* prod runs from a supervisor; the touch is dev-only convenience */
    } finally {
      process.exit(1);
    }
  }, 400);
});

restRouter.use("/admin", adminRouter);

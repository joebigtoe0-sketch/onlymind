import express from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// optional .env next to the server package (never committed)
loadDotEnv(path.resolve(process.cwd(), ".env"));

const { restRouter } = await import("./net/rest");
const { attachWs } = await import("./net/ws");
const { restoreOrCreate, sim } = await import("./sim/cosmos");
const { restoreMind } = await import("./sim/mind");
const { restoreHolders, startDwellerMurmur } = await import("./sim/holders");
const { startLoop } = await import("./sim/loop");
const { startOpening } = await import("./sim/driver");
const { startScheduler } = await import("./brain/scheduler");
const { startAmbientDrip, startSignalStatic } = await import("./voice/transmissions");
const { startTweetComposer } = await import("./voice/tweets");
const { startAnomalyClock } = await import("./sim/deep");
const { startMeditations } = await import("./voice/meditations");
const { startChainFeed } = await import("./chain/feed");
const { startFeeClaims } = await import("./chain/acts");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv(file: string) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        const value = m[2]
          .replace(/\s+#.*$/, "") // inline comments
          .trim()
          .replace(/^["']|["']$/g, "");
        process.env[m[1]] = value;
      }
    }
  } catch {
    /* no .env — fine */
  }
}

const { visionsDir } = await import("./voice/visions");

const app = express();
app.use(express.json());
app.use("/api", restRouter);
app.use("/visions", express.static(visionsDir())); // the painted thoughts

// In production the server serves the built client; in dev, Vite serves it
// and proxies /api and /ws here.
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const server = http.createServer(app);
attachWs(server);

const fresh = restoreOrCreate();
restoreMind();
restoreHolders();
console.log(
  fresh
    ? `[onlymind] a new mind — seed ${sim.seed}`
    : `[onlymind] resuming — seed ${sim.seed}, ${sim.planets.length} worlds held`,
);

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`[onlymind] the only mind — listening on :${port} (brain: ${process.env.BRAIN_MODE ?? "mock"})`);
  startLoop();
  const handoverMs = startOpening(fresh);
  startScheduler(handoverMs);
  startAmbientDrip();
  startSignalStatic();
  startDwellerMurmur();
  startTweetComposer();
  startAnomalyClock();
  startMeditations();
  startChainFeed();
  startFeeClaims();
});

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { ClientMsg, type Snapshot, type Bodies, type Hello } from "../../../shared/src/protocol";
import { sim } from "../sim/cosmos";
import { coherence, mind } from "../sim/mind";
import { holders } from "../sim/holders";

// Connection registry. Every browser is a pure renderer over this socket:
// hello -> snapshot on join, then 10 Hz deltas (broadcast from the loop).
// camera_interest lets the server stream only nearby bodies as the cosmos
// grows beyond what a client should hold.

type ClientState = {
  interest: { center: [number, number, number]; radius: number } | null;
};

const clients = new Map<WebSocket, ClientState>();

export function attachWs(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.set(ws, { interest: null });

    const hello: Hello = { type: "hello", serverTime: Date.now(), seed: sim.seed };
    ws.send(JSON.stringify(hello));

    const now = Date.now();
    const snapshot: Snapshot = {
      type: "snapshot",
      serverTime: now,
      tick: sim.tick,
      ignitionAt: sim.ignitionAt,
      mood: Math.round(sim.moodTarget * 1000) / 1000,
      planets: sim.planets,
      thoughts: sim.liveThoughts.filter((t) => now - t.at < 4000),
      focus: sim.focus,
      depth: mind.depth,
      activePlanetId: mind.activePlanetId,
      fragments: mind.fragments,
      companion: mind.companion,
      marks: sim.marks,
      dwellers: holders.dwellers,
      instruments: {
        certainty: Math.round(mind.certaintyOfSelf * 100) / 100,
        belief: Math.round(mind.beliefInOutside * 100) / 100,
        coherence: Math.round(coherence() * 100) / 100,
      },
    };
    ws.send(JSON.stringify(snapshot));

    ws.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      const msg = ClientMsg.safeParse(parsed);
      if (!msg.success) return;

      if (msg.data.type === "camera_interest") {
        const { center, radius } = msg.data;
        const state = clients.get(ws);
        if (!state) return;
        state.interest = { center, radius };
        // reply with the bodies whose orbits intersect the interest sphere
        const [cx, cy, cz] = center;
        const centerDist = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const bodies: Bodies = {
          type: "bodies",
          planets: sim.planets.filter(
            (p) => Math.abs(centerDist - p.orbitRadius) <= radius + 4,
          ),
        };
        ws.send(JSON.stringify(bodies));
      } else if (msg.data.type === "ping") {
        ws.send(JSON.stringify({ type: "hello", serverTime: Date.now(), seed: sim.seed }));
      }
      // open_log is served over REST (/api/planet/:id) for now
    });

    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  return wss;
}

export function broadcast(msg: object) {
  if (clients.size === 0) return;
  const json = JSON.stringify(msg);
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(json);
  }
}

export function watcherCount(): number {
  return clients.size;
}

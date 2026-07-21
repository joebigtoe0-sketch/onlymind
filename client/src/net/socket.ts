import { ServerMsg } from "@shared/protocol";
import { useCosmos } from "../store";
import { maybeBeginIntro, syncServerTime } from "../lib/time";
import { dyn } from "../scene/dynamics";

// The client is a pure renderer: snapshot on join, cosmic events from deltas.

let ws: WebSocket | null = null;
let knownSeed: string | null = null;

export function connectSocket() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws`);
  } catch {
    ws = null;
    window.setTimeout(connectSocket, 3000);
    return;
  }

  ws.onmessage = (ev) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    const res = ServerMsg.safeParse(parsed);
    if (!res.success) return;
    const msg = res.data;
    const st = useCosmos.getState();

    if (msg.type === "hello") {
      syncServerTime(msg.serverTime);
      // a different seed means a different universe — a full reset happened
      if (knownSeed != null && knownSeed !== msg.seed) {
        location.reload();
        return;
      }
      knownSeed = msg.seed;
      st.setConnected(true);
    } else if (msg.type === "snapshot") {
      syncServerTime(msg.serverTime);
      maybeBeginIntro(msg.ignitionAt); // an old universe replays its genesis
      dyn.moodTarget = msg.mood;
      dyn.instrTarget = { ...msg.instruments };
      st.applySnapshot(msg);
    } else if (msg.type === "delta") {
      syncServerTime(msg.serverTime);
      dyn.moodTarget = msg.mood;
      if (msg.instruments) dyn.instrTarget = { ...msg.instruments };
      if (msg.events.length) st.applyEvents(msg.events);
    } else {
      st.mergeBodies(msg.planets);
    }
  };

  ws.onclose = () => {
    ws = null;
    useCosmos.getState().setConnected(false);
    window.setTimeout(connectSocket, 3000);
  };
}

// The camera reports what it sees; the server streams only nearby bodies.
export function reportCameraInterest(center: [number, number, number], radius: number) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "camera_interest", center, radius }));
}

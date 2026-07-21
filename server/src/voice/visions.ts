import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Vision } from "../../../shared/src/cosmos";
import { sim } from "../sim/cosmos";
import * as db from "../db/store";
import { kvGet, kvSet } from "../db/store";
import { watcherCount } from "../net/ws";

// Visions: the mind's thoughts, painted. When it becomes a species or sees a
// world from within, the thought can be rendered as an image — shown briefly
// in the sky as an apparition, kept forever in the world's log.
//
// Uses any OpenAI-compatible images endpoint. Own budget cap; never spends
// while nobody is watching; cooldown between paintings.

const API_KEY = (process.env.IMAGE_API_KEY ?? process.env.LLM_API_KEY ?? "").trim();
const BASE_URL = process.env.IMAGE_BASE_URL ?? "https://api.openai.com/v1";
const MODEL = process.env.IMAGE_MODEL ?? "gpt-image-1";
const QUALITY = process.env.IMAGE_QUALITY ?? "low";
const DAILY_USD = Number(process.env.IMAGE_DAILY_USD ?? 2);
const PRICE_EACH = Number(process.env.IMAGE_PRICE ?? 0.02);
const ENABLED = (process.env.IMAGES ?? "on") !== "off";
const COOLDOWN_MS = 4 * 60 * 1000;

let lastAt = 0;
let inFlight = false;
let visionSerial = -1;

function spendKey(): string {
  return `imgspend:${new Date().toISOString().slice(0, 10)}`;
}

function visionsDir(): string {
  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), "onlymind.db");
  return path.join(path.dirname(dbPath), "visions");
}

export function visionsAvailable(): boolean {
  return ENABLED && API_KEY.length > 0;
}

const STYLE =
  "A hallucination inside a lonely cosmic mind: %s. Dark luminous dreamscape painting, " +
  "bioluminescent light against deep black space, soft glow, ethereal, painterly, " +
  "melancholic and beautiful. Nothing from Earth: any beings are alien, never-seen " +
  "forms — no humans, no familiar animals. No text, no borders, no watermark.";

// fire-and-forget; failures are silent (a vision that didn't come is nothing)
export function maybePaintVision(planetId: string, text: string): void {
  if (!visionsAvailable() || inFlight) return;
  const now = Date.now();
  if (now - lastAt < COOLDOWN_MS) return;
  if (watcherCount() === 0) return; // no audience, no spend
  if (Number(kvGet(spendKey()) ?? 0) >= DAILY_USD) return;
  lastAt = now;
  inFlight = true;
  paint(planetId, text)
    .catch(() => {})
    .finally(() => {
      inFlight = false;
    });
}

async function paint(planetId: string, text: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch(`${BASE_URL}/images/generations`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        prompt: STYLE.replace("%s", text.slice(0, 400)),
        size: "1024x1024",
        quality: QUALITY,
        n: 1,
      }),
    });
    if (!res.ok) {
      console.warn(`[visions] http ${res.status}`);
      return;
    }
    const data = (await res.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    let buf: Buffer | null = null;
    const first = data.data?.[0];
    if (first?.b64_json) {
      buf = Buffer.from(first.b64_json, "base64");
    } else if (first?.url) {
      const img = await fetch(first.url);
      buf = Buffer.from(await img.arrayBuffer());
    }
    if (!buf) return;

    kvSet(spendKey(), String(Number(kvGet(spendKey()) ?? 0) + PRICE_EACH));

    if (visionSerial < 0) visionSerial = db.maxVisionOrdinal();
    const id = `v${visionSerial++}`;
    const dir = visionsDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = `${id}-${crypto.randomBytes(4).toString("hex")}.png`;
    fs.writeFileSync(path.join(dir, file), buf);

    const vision: Vision = {
      id,
      planetId,
      text: text.slice(0, 240),
      url: `/visions/${file}`,
      at: Date.now(),
    };
    db.insertVision(vision);
    db.insertEvent("vision", vision.at, { id, planetId });
    sim.events.push({ kind: "vision", vision });
    console.log(`[visions] painted ${id} for ${planetId}`);
  } finally {
    clearTimeout(timer);
  }
}

export { visionsDir };

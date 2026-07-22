import { CognitionSchema, type Cognition } from "../../../shared/src/actions";
import { kvGet, kvSet } from "../db/store";

// Provider-agnostic LLM call (§12): any OpenAI-compatible /chat/completions
// endpoint. Hard zod validation; any failure returns null and the scheduler
// falls back to a mock cognition for that one step — never a retry storm.
// Defaults point at Anthropic's OpenAI-compatible surface.

const BASE_URL = process.env.LLM_BASE_URL ?? "https://api.anthropic.com/v1";
const API_KEY = process.env.LLM_API_KEY ?? "";
const MODEL = process.env.LLM_MODEL ?? "claude-sonnet-5";
// the whole-mind voice deserves the strongest model; fragments can stay cheap
export const MIND_MODEL = process.env.LLM_MODEL_MIND ?? MODEL;
export const FRAGMENT_MODEL = process.env.LLM_MODEL_FRAGMENT ?? MODEL;
const DAILY_USD = Number(process.env.LLM_DAILY_USD ?? 10);
const PRICE_IN = Number(process.env.LLM_PRICE_IN ?? 3); // USD per 1M tokens
const PRICE_OUT = Number(process.env.LLM_PRICE_OUT ?? 15);

export function hasApiKey(): boolean {
  return API_KEY.length > 0;
}

function spendKey(): string {
  return `spend:${new Date().toISOString().slice(0, 10)}`;
}

export function spendToday(): number {
  return Number(kvGet(spendKey()) ?? 0);
}

// the daily USD circuit breaker (§12): past budget, degrade to mock until reset
export function budgetExhausted(): boolean {
  return spendToday() >= DAILY_USD;
}

// free-text call for the elegist and other prose voices (§10)
export async function callFreeform(
  system: string,
  user: string,
  maxTokens: number,
  model: string = MODEL,
): Promise<string | null> {
  if (!hasApiKey() || budgetExhausted()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.85,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const inTok = data.usage?.prompt_tokens ?? 0;
    const outTok = data.usage?.completion_tokens ?? 0;
    kvSet(spendKey(), String(spendToday() + (inTok * PRICE_IN + outTok * PRICE_OUT) / 1e6));
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function callLLM(
  system: string,
  user: string,
  model: string = MODEL,
): Promise<Cognition | null> {
  if (!hasApiKey() || budgetExhausted()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        temperature: 0.9,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[brain] llm http ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    // account spend before parsing — a malformed reply still cost money
    const inTok = data.usage?.prompt_tokens ?? 0;
    const outTok = data.usage?.completion_tokens ?? 0;
    const cost = (inTok * PRICE_IN + outTok * PRICE_OUT) / 1e6;
    kvSet(spendKey(), String(spendToday() + cost));

    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    // tolerate fenced or prefixed JSON
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = CognitionSchema.safeParse(JSON.parse(match[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

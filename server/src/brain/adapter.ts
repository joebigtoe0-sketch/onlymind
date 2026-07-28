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

// reasoning-family models (gpt-5*, o1/o3/o4...) reject `temperature` and use
// `max_completion_tokens` — which COUNTS the invisible reasoning tokens.
// Too tight a cap means the model spends the whole budget thinking and
// returns an empty/truncated message, which silently fell back to a canned
// mock line ("Omm... tide-fence") at exactly the biggest moments. Give the
// thinking real headroom; the budget breaker still bounds the money.
const REASONING_EFFORT = process.env.LLM_REASONING_EFFORT ?? "low";
// reasoning tokens count against max_completion_tokens: higher effort needs
// a much bigger budget or calls come back EMPTY (all thinking, no words)
const REASONING_BUDGET =
  REASONING_EFFORT === "low" ? 2400 : REASONING_EFFORT === "medium" ? 9000 : 20000;

function bodyFor(model: string, maxTokens: number, temperature: number) {
  if (/^(gpt-5|o\d)/i.test(model)) {
    return { model, max_completion_tokens: maxTokens + REASONING_BUDGET, reasoning_effort: REASONING_EFFORT };
  }
  return { model, max_tokens: maxTokens, temperature };
}
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
        ...bodyFor(model, maxTokens, 0.85),
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

// tolerant parse: models emit literal newlines inside JSON strings and
// trailing commas — both invalid JSON. Repair before giving up.
function parseCognitionJson(raw: string): unknown | null {
  const attempts = [
    raw,
    raw.replace(/[\r\n]+/g, " "),
    raw.replace(/[\r\n]+/g, " ").replace(/,\s*([}\]])/g, "$1"),
  ];
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      /* next repair */
    }
  }
  return null;
}

export async function callLLM(
  system: string,
  user: string,
  model: string = MODEL,
): Promise<Cognition | null> {
  if (!hasApiKey() || budgetExhausted()) return null;

  const controller = new AbortController();
  // reasoning models regularly think past 25s — give the call real room
  const timer = setTimeout(() => controller.abort(), 50000);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        ...bodyFor(model, 600, 0.9),
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
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    // account spend before parsing — a malformed reply still cost money
    const inTok = data.usage?.prompt_tokens ?? 0;
    const outTok = data.usage?.completion_tokens ?? 0;
    const cost = (inTok * PRICE_IN + outTok * PRICE_OUT) / 1e6;
    kvSet(spendKey(), String(spendToday() + cost));

    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      // a mock line is about to play instead of the real mind — say why
      console.warn(`[brain] empty reply (finish: ${choice?.finish_reason ?? "?"}, out: ${outTok} tok)`);
      return null;
    }

    // tolerate fenced or prefixed JSON
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn(`[brain] no JSON in reply (finish: ${choice?.finish_reason ?? "?"})`);
      return null;
    }
    const json = parseCognitionJson(match[0]);
    if (json == null) {
      console.warn("[brain] unparseable JSON in reply");
      return null;
    }
    const parsed = CognitionSchema.safeParse(json);
    if (!parsed.success) {
      console.warn("[brain] cognition failed validation");
      return null;
    }
    // model refusals must never enter the stream as thoughts — the whole
    // point is that these ARE its private thoughts
    if (/\b(I (cannot|can't|am unable to|won't be able to) (share|provide|assist|help|generate)|as an AI\b|I'?m sorry, (but )?I)/i.test(parsed.data.thought)) {
      console.warn("[brain] model refused in character — dropping to silence");
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.warn(`[brain] llm call failed: ${String(e).slice(0, 100)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

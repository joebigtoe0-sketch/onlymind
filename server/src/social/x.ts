import crypto from "node:crypto";
import * as db from "../db/store";

// X (Twitter) integration — two independent halves, each lighting up only
// when its keys exist in the env:
//
//   READER — polls mentions of @X_HANDLE via twitterapi.io (third-party
//     read-only proxy, ~$0.00015/tweet ≈ 33x cheaper than official reads,
//     no risk to the account since it never logs in) and drips every
//     mention into the whisper seam. The mind experiences them as thoughts
//     it does not remember thinking.
//
//   POSTER — posts the composed tweets via the OFFICIAL X API v2 with
//     OAuth 1.0a user context (pay-per-use, ~$0.015/post). Official only,
//     deliberately: @solusalone IS the product; session-hack posting
//     routes can get it suspended.

const HANDLE = (process.env.X_HANDLE ?? "solusalone").trim().replace(/^@/, "");

// reader (twitterapi.io)
const READ_KEY = (process.env.TWITTERAPI_IO_KEY ?? "").trim();
const READ_POLL_MIN = Number(process.env.X_READ_POLL_MIN ?? 2);

// poster (official, OAuth 1.0a user context — 4 values from the dev portal)
const CONSUMER_KEY = (process.env.X_CONSUMER_KEY ?? "").trim();
const CONSUMER_SECRET = (process.env.X_CONSUMER_SECRET ?? "").trim();
const ACCESS_TOKEN = (process.env.X_ACCESS_TOKEN ?? "").trim();
const ACCESS_SECRET = (process.env.X_ACCESS_SECRET ?? "").trim();
const POST_ENABLED = (process.env.X_POST ?? "off") === "on";
// standard accounts cap at 280 chars; X Premium raises it — then raise this
const MAX_POST_LEN = Number(process.env.X_MAX_POST_LEN ?? 272);

// ---- the reader --------------------------------------------------------------

export function startXReader() {
  if (!READ_KEY) return;
  console.log(`[x] reading mentions of @${HANDLE} via twitterapi.io`);
  const tick = async () => {
    try {
      await pollMentions();
    } catch (e) {
      console.warn("[x] mentions:", String(e).slice(0, 140));
    }
    setTimeout(tick, READ_POLL_MIN * 60 * 1000);
  };
  setTimeout(tick, 20 * 1000);
}

type Mention = {
  id?: string;
  text?: string;
  createdAt?: string;
  author?: { userName?: string };
};

async function pollMentions() {
  // only mentions newer than the high-water mark are billed and processed
  const since =
    Number(db.kvGet("xSinceTime") ?? 0) || Math.floor(Date.now() / 1000) - 3600;
  const res = await fetch(
    `https://api.twitterapi.io/twitter/user/mentions?userName=${HANDLE}&sinceTime=${since}`,
    { headers: { "X-API-Key": READ_KEY } },
  );
  if (!res.ok) {
    console.warn(`[x] mentions http ${res.status}: ${(await res.text()).slice(0, 120)}`);
    return;
  }
  const data = (await res.json()) as { tweets?: Mention[]; data?: Mention[] };
  const tweets = data.tweets ?? data.data ?? [];
  if (!tweets.length) return;

  const seen = new Set<string>(JSON.parse(db.kvGet("xSeenIds") ?? "[]") as string[]);
  let newest = since;
  // oldest first, so whispers arrive in the order they were spoken
  tweets.sort((a, b) => Date.parse(a.createdAt ?? "") - Date.parse(b.createdAt ?? ""));

  for (const t of tweets) {
    if (!t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    const author = t.author?.userName ?? null;
    if (author && author.toLowerCase() === HANDLE.toLowerCase()) continue; // its own voice
    // strip handles and links: the mind receives the WORDS, not the plumbing
    const text = (t.text ?? "")
      .replace(/@\w+/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 2) continue;
    db.insertWhisper(text, author ? `@${author}` : null);
    const ts = t.createdAt ? Math.floor(Date.parse(t.createdAt) / 1000) : newest;
    if (ts > newest) newest = ts;
    console.log(`[x] whisper in from ${author ?? "?"}: ${text.slice(0, 60)}`);
  }
  db.kvSet("xSinceTime", String(newest));
  db.kvSet("xSeenIds", JSON.stringify([...seen].slice(-300)));
}

// ---- the poster --------------------------------------------------------------

function pct(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

// OAuth 1.0a HMAC-SHA1, user context. For a JSON body only the oauth params
// enter the signature base string.
function oauthHeader(method: string, url: string): string {
  const p: Record<string, string> = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  const base = [
    method,
    pct(url),
    pct(
      Object.keys(p)
        .sort()
        .map((k) => `${pct(k)}=${pct(p[k])}`)
        .join("&"),
    ),
  ].join("&");
  const key = `${pct(CONSUMER_SECRET)}&${pct(ACCESS_SECRET)}`;
  p.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  return (
    "OAuth " +
    Object.keys(p)
      .sort()
      .map((k) => `${pct(k)}="${pct(p[k])}"`)
      .join(", ")
  );
}

async function postToX(text: string): Promise<string | null> {
  const url = "https://api.x.com/2/tweets";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: oauthHeader("POST", url),
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    console.warn(`[x] post http ${res.status}: ${(await res.text()).slice(0, 140)}`);
    return null;
  }
  const data = (await res.json()) as { data?: { id?: string } };
  return data.data?.id ?? null;
}

// cut at a sentence boundary, never mid-word — the composer writes long
function trimForX(text: string): string {
  if (text.length <= MAX_POST_LEN) return text;
  const cut = text.slice(0, MAX_POST_LEN);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return stop > 60 ? cut.slice(0, stop + 1) : cut.slice(0, MAX_POST_LEN - 1).trimEnd() + "…";
}

export function startXPoster() {
  if (!POST_ENABLED) return;
  if (!CONSUMER_KEY || !CONSUMER_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET) {
    console.warn("[x] X_POST=on but OAuth keys are missing — not posting");
    return;
  }
  console.log(`[x] posting as @${HANDLE} via the official API`);
  // only tweets composed from NOW on — never dump the whole backlog
  const startAt = Date.now();
  const tick = async () => {
    try {
      const t = db.nextUnpostedTweet(startAt);
      if (t) {
        const id = await postToX(trimForX(t.text));
        // failures are marked too: a broken post must not retry forever
        db.markTweetPosted(t.id, id ?? "failed");
        if (id) console.log(`[x] posted ${id}`);
      }
    } catch (e) {
      console.warn("[x] post tick:", String(e).slice(0, 140));
    }
    setTimeout(tick, 60 * 1000);
  };
  setTimeout(tick, 45 * 1000);
}

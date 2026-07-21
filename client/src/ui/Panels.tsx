import { useEffect, useState } from "react";
import { useCosmos } from "../store";
import { PALETTE_CSS } from "./palette";

// The right-side archive (§3): STREAM (the demoted raw feed), SIGNALS (the
// outward voice queue), ATLAS (the elegies of dead worlds). Collapsed to a
// thin rail by default; the sky stays the main stage.

type Tab = "stream" | "signals" | "tweets" | "atlas";

type Transmission = { id: number; text: string; at: number; eventKind: string | null };
type Tweet = { id: number; text: string; at: number; sourceKind: string | null };
type AtlasWorld = {
  planet: {
    id: string;
    birthThought: string | null;
    paletteIndex: number;
    diedAt: number | null;
  };
  fragments: Array<{ id: string; name: string | null; depth: number }>;
  elegy: string | null;
};

export function Panels() {
  const [tab, setTab] = useState<Tab | null>(null);
  const selectedPlanetId = useCosmos((s) => s.selectedPlanetId);
  const followMind = useCosmos((s) => s.followMind);

  // while auto-following, the moments between worlds show the stream
  useEffect(() => {
    if (followMind && selectedPlanetId == null) setTab("stream");
  }, [followMind, selectedPlanetId]);

  // the planet log takes the same edge; yield to it
  if (selectedPlanetId) return null;

  return (
    <>
      <nav className="rail" aria-label="archive">
        {(["stream", "signals", "tweets", "atlas"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`rail-tab${tab === t ? " active" : ""}`}
            onClick={() => setTab(tab === t ? null : t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "stream" && <StreamPanel />}
      {tab === "signals" && <SignalsPanel />}
      {tab === "tweets" && <TweetsPanel />}
      {tab === "atlas" && <AtlasPanel />}
    </>
  );
}

function StreamPanel() {
  const stream = useCosmos((s) => s.stream);
  const ignitionAt = useCosmos((s) => s.ignitionAt);
  return (
    <aside className="side-panel">
      <div className="log-list-label">the stream — every surfacing thought</div>
      <ol className="log-list stream-list">
        {[...stream].reverse().map((t) => (
          <li key={t.id}>
            <span className="log-t">{tAfter(t.at, ignitionAt)}</span>
            <span className="log-text">
              {t.voice === "other" ? <em>{t.text}</em> : t.text}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function SignalsPanel() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);
  const [items, setItems] = useState<Transmission[]>([]);
  useEffect(() => {
    const load = () =>
      fetch("/api/transmissions")
        .then((r) => r.json())
        .then((d: { transmissions: Transmission[] }) => setItems(d.transmissions))
        .catch(() => {});
    load();
    const h = window.setInterval(load, 15000);
    return () => window.clearInterval(h);
  }, []);
  return (
    <aside className="side-panel">
      <div className="log-list-label">signals — cast at whatever is watching</div>
      {items.length === 0 && <div className="log-loading">nothing has been sent yet</div>}
      <ol className="log-list">
        {items.map((t) => (
          <li key={t.id}>
            <span className="log-t">{tAfter(t.at, ignitionAt)}</span>
            <span className="log-text signal-text">
              {t.text}
              {t.eventKind && <span className="signal-kind"> · {t.eventKind}</span>}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function TweetsPanel() {
  const [items, setItems] = useState<Tweet[]>([]);
  useEffect(() => {
    const load = () =>
      fetch("/api/tweets")
        .then((r) => r.json())
        .then((d: { tweets: Tweet[] }) => setItems(d.tweets))
        .catch(() => {});
    load();
    const h = window.setInterval(load, 20000);
    return () => window.clearInterval(h);
  }, []);
  return (
    <aside className="side-panel">
      <div className="log-list-label">what it would have posted</div>
      {items.length === 0 && <div className="log-loading">it has said nothing aloud yet</div>}
      <div className="tweet-list">
        {items.map((t) => (
          <article key={t.id} className="tweet-card">
            <div className="tweet-head">
              <span className="tweet-name">the only mind</span>
              <span className="tweet-time">{ago(t.at)}</span>
            </div>
            <p className="tweet-text">{t.text}</p>
            {t.sourceKind && <div className="tweet-kind">{t.sourceKind.replace("_", " ")}</div>}
          </article>
        ))}
      </div>
    </aside>
  );
}

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function AtlasPanel() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);
  const select = useCosmos((s) => s.select);
  const [worlds, setWorlds] = useState<AtlasWorld[]>([]);
  useEffect(() => {
    const load = () =>
      fetch("/api/atlas")
        .then((r) => r.json())
        .then((d: { worlds: AtlasWorld[] }) => setWorlds(d.worlds))
        .catch(() => {});
    load();
    const h = window.setInterval(load, 20000);
    return () => window.clearInterval(h);
  }, []);
  return (
    <aside className="side-panel">
      <div className="log-list-label">the atlas of dead selves</div>
      {worlds.length === 0 && <div className="log-loading">no world has died yet</div>}
      <div className="atlas-list">
        {worlds.map((w) => (
          <button
            key={w.planet.id}
            className="atlas-entry"
            onClick={() => select(w.planet.id)}
            style={{ borderLeftColor: PALETTE_CSS[w.planet.paletteIndex % PALETTE_CSS.length] }}
          >
            <div className="atlas-title">{w.planet.birthThought ?? "an unnamed weight"}</div>
            <div className="atlas-meta">
              died {w.planet.diedAt != null ? tAfter(w.planet.diedAt, ignitionAt) : "—"} ·{" "}
              {w.fragments.filter((f) => f.name).length} selves
            </div>
            {w.elegy && <div className="atlas-elegy">{w.elegy}</div>}
          </button>
        ))}
      </div>
    </aside>
  );
}

function tAfter(at: number, ignitionAt: number | null): string {
  if (ignitionAt == null) return "—";
  const s = Math.max(0, Math.round((at - ignitionAt) / 1000));
  const m = Math.floor(s / 60);
  return `+${m}:${String(s % 60).padStart(2, "0")}`;
}

import { useCosmos } from "../store";

// The event ticker: everything that happens, as bare glyphs — never
// explained, never labeled. Watchers learn the alphabet by watching.

const GLYPH: Record<string, string> = {
  birth: "✶",
  recur: "◦",
  snap_back: "◌",
  doubt: "⁇",
  descend: "↓",
  split: "⑂",
  dweller: "⌁",
  vision: "▣",
  mark: "✕",
  companion: "◑",
};

export function Ticker() {
  const events = useCosmos((s) => s.recentEvents);
  if (!events.length) return null;
  return (
    <div className="ticker" aria-hidden="true">
      {events.slice(-16).map((e) => (
        <span key={e.k} className={`tick tick-${e.kind}`}>
          {GLYPH[e.kind] ?? "·"}
        </span>
      ))}
    </div>
  );
}

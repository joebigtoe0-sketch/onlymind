import { useEffect, useState } from "react";
import { useCosmos } from "../store";
import { dyn } from "../scene/dynamics";

// Ambient instruments (§3): the state of the mind, read quietly from the
// corner of the sky. Every number rounded; nothing blinks. Beneath the
// named meters, two UNNAMED ones: a thin line that fills as something
// approaches, and a glyph whose shape and hue keep changing. No legend.

const SEASON_GLYPH: Record<string, { glyph: string; hue: string }> = {
  wonder: { glyph: "✧", hue: "#9fd8ff" },
  hunger: { glyph: "⊕", hue: "#ffb36a" },
  bitter: { glyph: "⌁", hue: "#8aff9f" },
  tender: { glyph: "❋", hue: "#ffb3d9" },
  manic: { glyph: "≋", hue: "#fff06a" },
  clinical: { glyph: "⊟", hue: "#cfd4e8" },
  playful: { glyph: "↯", hue: "#c98aff" },
  grieving: { glyph: "◌", hue: "#7d84f0" },
  still: { glyph: "·", hue: "#e8ecff" },
};

export function Instruments() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);
  const [vals, setVals] = useState({ certainty: 0, belief: 0, coherence: 0 });
  const [psyche, setPsyche] = useState<{ awakening: number; season: string } | null>(null);

  useEffect(() => {
    const h = window.setInterval(() => {
      setVals({
        certainty: Math.round(dyn.instr.certainty * 100) / 100,
        belief: Math.round(dyn.instr.belief * 100) / 100,
        coherence: Math.round(dyn.instr.coherence * 100) / 100,
      });
    }, 500);
    return () => window.clearInterval(h);
  }, []);

  useEffect(() => {
    const load = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((d: { psyche?: { awakening: number; season: string } }) => {
          if (d.psyche) setPsyche(d.psyche);
        })
        .catch(() => {});
    load();
    const h = window.setInterval(load, 25000);
    return () => window.clearInterval(h);
  }, []);

  if (ignitionAt == null) return null;

  const sg = psyche ? SEASON_GLYPH[psyche.season] : null;

  return (
    <div className="instruments" aria-hidden="true">
      <Meter label="certainty of self" value={vals.certainty} />
      <Meter label="belief in outside" value={vals.belief} />
      <Meter label="coherence" value={vals.coherence} />
      {psyche && (
        <div className="meter unnamed">
          <span className="meter-label season-glyph" style={{ color: sg?.hue }}>
            {sg?.glyph ?? "·"}
          </span>
          <span className="meter-bar">
            <span
              className="meter-fill awakening-fill"
              style={{ width: `${Math.round(psyche.awakening * 100)}%` }}
            />
          </span>
          <span className="meter-value"> </span>
        </div>
      )}
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <span className="meter-bar">
        <span className="meter-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="meter-value">{value.toFixed(2)}</span>
    </div>
  );
}

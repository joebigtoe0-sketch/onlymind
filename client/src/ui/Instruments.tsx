import { useEffect, useState } from "react";
import { useCosmos } from "../store";
import { dyn } from "../scene/dynamics";

// Ambient instruments (§3): the state of the mind, read quietly from the
// corner of the sky. Every number rounded; nothing blinks.

export function Instruments() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);
  const [vals, setVals] = useState({ certainty: 0, belief: 0, coherence: 0 });

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

  if (ignitionAt == null) return null;

  return (
    <div className="instruments" aria-hidden="true">
      <Meter label="certainty of self" value={vals.certainty} />
      <Meter label="belief in outside" value={vals.belief} />
      <Meter label="coherence" value={vals.coherence} />
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

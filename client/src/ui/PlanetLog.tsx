import { useEffect, useState } from "react";
import type { PlanetLog as PlanetLogData } from "@shared/protocol";
import { useCosmos } from "../store";
import { PALETTE_CSS } from "./palette";

// The log of a held thought (§3): what the mind was thinking when it made
// this world, and everything it has thought here since. Opens on click;
// grows into the full case file (fragments, how the dream ended) in Slice 9.

export function PlanetLog() {
  const selectedPlanetId = useCosmos((s) => s.selectedPlanetId);
  const select = useCosmos((s) => s.select);
  const [log, setLog] = useState<PlanetLogData | null>(null);

  useEffect(() => {
    setLog(null);
    if (!selectedPlanetId) return;
    let alive = true;
    const load = () =>
      fetch(`/api/planet/${selectedPlanetId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: PlanetLogData) => {
          if (alive) setLog(d);
        })
        .catch(() => {});
    load();
    const h = window.setInterval(load, 4000); // live thoughts keep arriving
    return () => {
      alive = false;
      window.clearInterval(h);
    };
  }, [selectedPlanetId]);

  if (!selectedPlanetId) return null;

  const planet = log?.planet;
  const tint = planet ? PALETTE_CSS[planet.paletteIndex % PALETTE_CSS.length] : "#cfd4e8";

  return (
    <aside className="log-panel">
      <button className="log-close" onClick={() => select(null)} aria-label="release">
        ×
      </button>
      <div className="log-eyebrow" style={{ color: tint }}>
        held thought · {selectedPlanetId}
      </div>
      {planet ? (
        <>
          <h2 className="log-title">{planet.birthThought ?? "an unnamed weight"}</h2>
          <div className="log-meta">
            <span>mass {planet.targetMass.toFixed(1)}</span>
            <span>returned to ×{planet.returns}</span>
            <span>born {sinceIgnition(planet.bornAt, log.ignitionAt)}</span>
          </div>
          {!planet.alive && planet.diedAt != null && (
            <div className="log-death">
              the dream ended {sinceIgnition(planet.diedAt, log.ignitionAt)} — this world is cold now
            </div>
          )}
          {log.fragments.length > 0 && (
            <>
              <div className="log-divider" />
              <div className="log-list-label">who the mind became here</div>
              <ol className="log-lineage">
                {log.fragments.map((f) => (
                  <li key={f.id} style={{ paddingLeft: `${(f.depth - 1) * 14}px` }}>
                    {f.name ?? "the world itself"}
                  </li>
                ))}
              </ol>
            </>
          )}
          {log.visions.length > 0 && (
            <>
              <div className="log-divider" />
              <div className="log-list-label">what it saw there</div>
              <div className="log-visions">
                {log.visions.map((v) => (
                  <figure key={v.id}>
                    <img src={v.url} alt="" loading="lazy" />
                    <figcaption>{v.text}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
          <div className="log-divider" />
          <div className="log-list-label">every thought held here</div>
          <ol className="log-list">
            {log.thoughts.map((t) => (
              <li key={t.id}>
                <span className="log-t">{sinceIgnition(t.at, log.ignitionAt)}</span>
                <span className="log-text">{t.text}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="log-loading">reading…</div>
      )}
    </aside>
  );
}

// timestamps in-fiction: age of the universe at that moment
function sinceIgnition(at: number, ignitionAt: number | null): string {
  if (ignitionAt == null) return "—";
  const s = Math.max(0, Math.round((at - ignitionAt) / 1000));
  const m = Math.floor(s / 60);
  return `+${m}:${String(s % 60).padStart(2, "0")}`;
}

// The quietest possible chrome: a wordmark that fades in after the first
// light, its one link outward, and a hint that appears once and dissolves.
// Everything else is sky.

export function Hud() {
  return (
    <div className="hud">
      <div className="wordmark">SOLUS</div>
      <a
        className="x-link"
        href="https://x.com/solusalone"
        target="_blank"
        rel="noreferrer"
        aria-label="Solus on X"
      >
        @solusalone
      </a>
      <div className="hint" aria-hidden="true">
        drag to orbit&ensp;·&ensp;scroll to approach&ensp;·&ensp;click a hallucination to hold
        it&ensp;·&ensp;press m to leave one word
      </div>
    </div>
  );
}

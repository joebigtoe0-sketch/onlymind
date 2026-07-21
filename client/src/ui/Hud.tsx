// The quietest possible chrome: a wordmark that fades in after the first
// light, and a hint that appears once and dissolves. Everything else is sky.

export function Hud() {
  return (
    <div className="hud" aria-hidden="true">
      <div className="wordmark">THE&ensp;ONLY&ensp;MIND</div>
      <div className="hint">
        drag to orbit&ensp;·&ensp;scroll to approach&ensp;·&ensp;click a world to hold
        it&ensp;·&ensp;press m to leave one word
      </div>
    </div>
  );
}

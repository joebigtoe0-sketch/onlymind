// Continuous animation state lives outside React: events nudge targets, the
// frame loop damps toward them. No component re-renders for breathing values.

export const dyn = {
  mood: 0.5, // 0 cold/despair .. 1 warm/believing
  moodTarget: 0.5, // written by the socket from server deltas
  // written by Focus each frame; planets read it to run hot while inhabited
  fixationPlanetId: null as string | null,
  fixationHeat: 0,
  // descent drama (§7): doubt makes the inhabited world flicker; snap-back
  // makes the core flare and contract (both in cosmos time, ms)
  doubtUntil: 0,
  snapBackAt: 0,
  // ambient instruments (§3), server-fed targets + smoothed display values
  instrTarget: { certainty: 0.65, belief: 0.3, coherence: 1 },
  instr: { certainty: 0.65, belief: 0.3, coherence: 1 },
};

export function tickDynamics(dt: number) {
  // the server owns the targets; the client only eases the visible values
  const k = 1 - Math.exp(-dt * 0.6);
  dyn.mood += (dyn.moodTarget - dyn.mood) * k;
  dyn.instr.certainty += (dyn.instrTarget.certainty - dyn.instr.certainty) * k;
  dyn.instr.belief += (dyn.instrTarget.belief - dyn.instr.belief) * k;
  dyn.instr.coherence += (dyn.instrTarget.coherence - dyn.instr.coherence) * k;
}

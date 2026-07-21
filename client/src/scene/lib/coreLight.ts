// The core's light is deterministic in time, so every body can compute the
// same flicker locally instead of syncing a value through React each frame.

export function coreFlicker(t: number): number {
  return (
    1 +
    0.05 * Math.sin(t * 2.1) +
    0.04 * Math.sin(t * 5.3 + 1.7) * Math.sin(t * 0.73) +
    0.03 * Math.sin(t * 11.9 + 0.4)
  );
}

// Scalar the planet shader uses for its lambert term. The ignition burst makes
// newborn light wash over everything, then settles into the mood-lit steady state.
export function coreLightIntensity(tSinceIgnition: number, mood: number): number {
  const burst = 5 * Math.exp(-tSinceIgnition * 1.8);
  return (0.85 + 0.5 * mood) * coreFlicker(tSinceIgnition) + burst;
}

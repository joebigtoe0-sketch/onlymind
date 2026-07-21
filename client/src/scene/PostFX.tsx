import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { dyn } from "./dynamics";

// Bloom is non-negotiable — it is what makes the core and bodies glow instead
// of looking flat. Its intensity breathes gently with the mind's mood.

export function PostFX() {
  const bloom = useRef<any>(null);

  useFrame(() => {
    if (bloom.current) bloom.current.intensity = 1.05 + dyn.mood * 0.55;
  });

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        // callback ref, not an object ref: the wrapper JSON.stringifies its
        // props to memoize effect args, and an object ref holding the effect
        // instance is circular (crashes prod React the moment it re-renders)
        ref={(e: unknown) => {
          bloom.current = e;
        }}
        mipmapBlur
        intensity={1.2}
        luminanceThreshold={0.12}
        luminanceSmoothing={0.3}
        radius={0.85}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise premultiply opacity={0.04} />
      <Vignette offset={0.28} darkness={0.7} />
    </EffectComposer>
  );
}

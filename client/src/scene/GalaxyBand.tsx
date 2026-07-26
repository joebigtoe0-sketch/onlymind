import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { sceneNow } from "../lib/time";
import { dyn } from "./dynamics";
import { GALAXY_FRAG, GALAXY_VERT } from "./lib/shaders";

// A far milky-way band wrapping the whole sky — the mind's own substrate,
// seen from inside. It wears the mood (violet-blue despair, dusty rose
// belief) and slow ripples of brightness travel it like waves on a brain.

export function GalaxyBand() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);
  const mesh = useRef<THREE.Mesh>(null);

  // constructed by hand: R3F would copy uniform records passed via JSX
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMood: { value: 0.5 },
          uBirth: { value: 0 },
        },
        vertexShader: GALAXY_VERT,
        fragmentShader: GALAXY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame(() => {
    const u = material.uniforms;
    u.uTime.value = performance.now() / 1000;
    u.uMood.value += (dyn.mood - u.uMood.value) * 0.01; // the sky changes slowly
    const tIgn = ignitionAt == null ? -1 : (sceneNow() - ignitionAt) / 1000;
    u.uBirth.value = Math.max(0, Math.min(1, (tIgn - 6) / 26)); // arrives after the first light
    if (mesh.current) mesh.current.visible = tIgn > 6;
  });

  return (
    <mesh
      ref={mesh}
      material={material}
      rotation={[0.35, 0, 0.18]} // the same tilt as the starfield's disc
      renderOrder={-2}
      frustumCulled={false}
      visible={false}
    >
      <sphereGeometry args={[660, 48, 32]} />
    </mesh>
  );
}

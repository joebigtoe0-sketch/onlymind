import { useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { dyn, tickDynamics } from "./dynamics";
import { Core } from "./Core";
import { Starfield } from "./Starfield";
import { Nebulae } from "./Nebulae";
import { Planet } from "./Planet";
import { Focus } from "./Focus";
import { Fragments } from "./Fragments";
import { Companion } from "./Companion";
import { Marks } from "./Marks";
import { Visions } from "./Visions";
import { Thoughts } from "./Thoughts";
import { CameraRig } from "./CameraRig";
import { PostFX } from "./PostFX";

// The R3F canvas: the whole cosmos. `flat` disables renderer tone mapping so
// HDR values survive into the composer, where ACES is applied at the end.

export function Cosmos() {
  const planets = useCosmos((s) => s.planets);

  return (
    <Canvas
      flat
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 3.5, 15], fov: 50, near: 0.1, far: 2000 }}
      onPointerMissed={() => useCosmos.getState().select(null)}
    >
      <Dynamics />
      <Nebulae />
      <Starfield />
      <Core />
      {planets.map((p) => (
        <Planet key={p.id} seed={p} />
      ))}
      <Focus />
      <Fragments />
      <Companion />
      <Marks />
      <Visions />
      <Thoughts />
      <CameraRig />
      <PostFX />
    </Canvas>
  );
}

// One place that advances the continuous state and lets the sky's color
// breathe (almost imperceptibly) with mood.
function Dynamics() {
  const scene = useThree((s) => s.scene);
  const bg = useMemo(() => new THREE.Color(0.004, 0.004, 0.01), []);

  useFrame((_, dt) => {
    tickDynamics(Math.min(dt, 0.1));
    const m = dyn.mood;
    bg.setRGB(0.004 + 0.0036 * m, 0.004 + 0.003 * m, 0.01 - 0.004 * m);
    scene.background = bg;
  });

  return null;
}

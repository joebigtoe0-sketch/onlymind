import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { STAR_FRAG, STAR_VERT } from "./lib/shaders";

// Instanced background stars. Before ignition none are visible; afterwards a
// light-front expands from the origin and ignites them outward (~7 s to the rim).

const COUNT = 7000;

export function Starfield() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);
  const gl = useThree((s) => s.gl);

  const { positions, sizes, phases, speeds, colors } = useMemo(() => makeStars(COUNT), []);

  // constructed by hand, not via JSX props: R3F copies each uniform record it
  // applies, which would orphan the objects this frame loop mutates
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uBirth: { value: -1 },
          uPixelRatio: { value: 1 },
        },
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame(() => {
    const u = material.uniforms;
    // uTime stays session-local (small floats for the twinkle); the birth
    // front uses shared cosmos time so every tab agrees on what exists
    u.uTime.value = performance.now() / 1000;
    u.uBirth.value = ignitionAt == null ? -1 : (sceneNow() - ignitionAt) / 1000;
    u.uPixelRatio.value = gl.getPixelRatio();
  });

  return (
    <points frustumCulled={false} renderOrder={-1} material={material}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-aSpeed" args={[speeds, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
      </bufferGeometry>
    </points>
  );
}

function gauss() {
  return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
}

function makeStars(count: number) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const discTilt = new THREE.Euler(0.35, 0, 0.18);
  const v = new THREE.Vector3();
  const r = Math.random;

  for (let i = 0; i < count; i++) {
    if (i < count * 0.65) {
      // spherical halo, denser toward the middle distances
      v.set(gauss(), gauss(), gauss())
        .normalize()
        .multiplyScalar(70 + 350 * Math.pow(r(), 1.5));
    } else {
      // a loose tilted disc so the sky has structure, not just noise
      const ang = r() * Math.PI * 2;
      const rad = 60 + 340 * Math.pow(r(), 1.4);
      v.set(Math.cos(ang) * rad, gauss() * 16, Math.sin(ang) * rad).applyEuler(discTilt);
    }
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;

    const hero = r() < 0.006;
    sizes[i] = hero ? 3.2 + r() * 1.8 : 0.7 + Math.pow(r(), 3) * 2.6;
    phases[i] = r() * Math.PI * 2;
    speeds[i] = 0.3 + r() * 2.2;

    const kind = r();
    if (kind < 0.68) {
      colors[i * 3] = 0.78 + 0.22 * r();
      colors[i * 3 + 1] = 0.84 + 0.16 * r();
      colors[i * 3 + 2] = 1.0;
    } else if (kind < 0.88) {
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.82;
      colors[i * 3 + 2] = 0.62 + 0.15 * r();
    } else {
      colors[i * 3] = 0.85;
      colors[i * 3 + 1] = 0.72;
      colors[i * 3 + 2] = 1.0;
    }
  }
  return { positions, sizes, phases, speeds, colors };
}

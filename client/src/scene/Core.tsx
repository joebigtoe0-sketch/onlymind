import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { sceneNow } from "../lib/time";
import { getSharedGlowTexture } from "./lib/textures";
import { SHELL_FRAG, SHELL_VERT } from "./lib/shaders";

// The ignition only (§5): the first light — flash, shockwave, a flare that
// rings like a struck bell and then contracts away, handing existence over to
// the mind-light (Focus.tsx). There is no persistent central body: when the
// mind is whole and clear, it is only the small light.

export function Core() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);

  const group = useRef<THREE.Group>(null);
  const sphere = useRef<THREE.Mesh>(null);
  const sphereMat = useRef<THREE.MeshBasicMaterial>(null);
  const glow = useRef<THREE.Sprite>(null);
  const flash = useRef<THREE.Sprite>(null);
  const shell = useRef<THREE.Mesh>(null);

  const glowTex = useMemo(() => getSharedGlowTexture(), []);

  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0.5, 0.65, 1.3) },
          uOpacity: { value: 0 },
        },
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (ignitionAt == null) {
      g.visible = false;
      return;
    }
    const t = (sceneNow() - ignitionAt) / 1000;
    if (t > 11) {
      g.visible = false; // the first light has become the mind-light
      return;
    }
    g.visible = true;

    // flare up with an overshoot ring, then contract away into the small light
    const grow = 1 - Math.exp(-t * 4.2);
    const ring = 1 + 0.5 * Math.exp(-t * 1.6) * Math.sin(t * 6.0);
    const contract = t < 4 ? 1 : Math.max(0, 1 - (t - 4) / 6);
    const scale = Math.max(0.0001, grow * ring * contract);

    sphere.current!.scale.setScalar(scale);
    sphereMat.current!.color.setRGB(3.2 * contract + 0.4, 2.7 * contract + 0.35, 2.0 * contract + 0.3);

    const gs = 6 * scale;
    glow.current!.scale.set(Math.max(0.001, gs), Math.max(0.001, gs), 1);
    (glow.current!.material as THREE.SpriteMaterial).opacity = 0.5 * contract;

    // the first flash of existence, gone in a couple of seconds
    const f = flash.current!;
    const fo = 0.9 * Math.exp(-t * 2.0);
    (f.material as THREE.SpriteMaterial).opacity = fo;
    f.visible = fo > 0.01;
    const fscale = 26 + 30 * (1 - Math.exp(-t * 1.5));
    f.scale.set(fscale, fscale, 1);

    // shockwave shell sweeping outward
    const sh = shell.current!;
    if (t < 4.5) {
      sh.visible = true;
      sh.scale.setScalar(1 + t * 20);
      shellMat.uniforms.uOpacity.value = 0.35 * Math.pow(1 - t / 4.5, 2);
    } else {
      sh.visible = false;
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={sphere}>
        <sphereGeometry args={[0.6, 48, 48]} />
        <meshBasicMaterial ref={sphereMat} toneMapped={false} />
      </mesh>
      <sprite ref={glow}>
        <spriteMaterial
          map={glowTex}
          color="#ffe0b0"
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </sprite>
      <sprite ref={flash} visible={false}>
        <spriteMaterial
          map={glowTex}
          color="#ffe9c4"
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </sprite>
      <mesh ref={shell} material={shellMat} frustumCulled={false}>
        <sphereGeometry args={[1, 48, 48]} />
      </mesh>
    </group>
  );
}

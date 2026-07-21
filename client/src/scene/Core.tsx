import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { dyn } from "./dynamics";
import { coreFlicker } from "./lib/coreLight";
import { getSharedGlowTexture } from "./lib/textures";
import { SHELL_FRAG, SHELL_VERT } from "./lib/shaders";

// The undivided mind: a single point of light at the origin (§5). Bright,
// breathing, unstable. Ignition is an overshoot flare, a flash sprite, and a
// limb-bright shockwave shell sweeping outward past the camera.

const COLD = new THREE.Color("#93a7ff");
const WARM = new THREE.Color("#ffc87a");

export function Core() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);

  const group = useRef<THREE.Group>(null);
  const sphere = useRef<THREE.Mesh>(null);
  const sphereMat = useRef<THREE.MeshBasicMaterial>(null);
  const innerGlow = useRef<THREE.Sprite>(null);
  const outerGlow = useRef<THREE.Sprite>(null);
  const flash = useRef<THREE.Sprite>(null);
  const shell = useRef<THREE.Mesh>(null);

  const glowTex = useMemo(() => getSharedGlowTexture(), []);
  const tint = useMemo(() => new THREE.Color(), []);

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
    g.visible = true;
    const now = sceneNow(); // during the genesis replay, this sweeps history
    const t = (now - ignitionAt) / 1000;
    const flick = coreFlicker(t);
    tint.copy(COLD).lerp(WARM, dyn.mood);

    // ignition envelope: rush up from nothing, ring like a struck bell, settle
    const grow = 1 - Math.exp(-t * 4.2);
    const ring = 1 + 0.5 * Math.exp(-t * 1.6) * Math.sin(t * 6.0);
    const breathe =
      1 + 0.05 * Math.sin(t * 0.8) + 0.025 * Math.sin(t * 2.17 + 1.3) * Math.sin(t * 0.53);

    // snap-back (§7): the memories rejoin — a hard flare, then a contraction
    let snap = 1;
    let snapGlow = 0;
    if (dyn.snapBackAt > 0) {
      const ts = (now - dyn.snapBackAt) / 1000;
      if (ts >= 0 && ts < 7) {
        snapGlow = 2.4 * Math.exp(-ts * 1.5);
        const dip = Math.exp(-Math.pow((ts - 1.6) / 0.9, 2)) * 0.3;
        snap = 1 + 0.55 * Math.exp(-ts * 2.8) - dip;
      }
    }

    const scale = Math.max(0.0001, grow * ring * breathe * snap);

    sphere.current!.scale.setScalar(scale);
    sphereMat.current!.color.copy(tint).multiplyScalar(2.6 * flick + snapGlow);

    const ig = innerGlow.current!;
    const igs = 5.5 * scale * (1 + (flick - 1) * 2);
    ig.scale.set(igs, igs, 1);
    (ig.material as THREE.SpriteMaterial).color.copy(tint);
    (ig.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.55 + snapGlow * 0.2);

    const og = outerGlow.current!;
    const ogs = 15 * scale;
    og.scale.set(ogs, ogs, 1);
    (og.material as THREE.SpriteMaterial).color.copy(tint);
    (og.material as THREE.SpriteMaterial).opacity = 0.15 + 0.07 * dyn.mood;

    // the first flash of existence, gone in a couple of seconds
    const f = flash.current!;
    const fo = 0.9 * Math.exp(-t * 2.0);
    const fm = f.material as THREE.SpriteMaterial;
    fm.opacity = fo;
    f.visible = fo > 0.01;
    const fscale = 26 + 30 * (1 - Math.exp(-t * 1.5));
    f.scale.set(fscale, fscale, 1);

    // shockwave shell sweeping outward
    const sh = shell.current!;
    if (t < 4.5) {
      sh.visible = true;
      const r = 1 + t * 20;
      sh.scale.setScalar(r);
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
      <sprite ref={innerGlow}>
        <spriteMaterial
          map={glowTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </sprite>
      <sprite ref={outerGlow}>
        <spriteMaterial
          map={glowTex}
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

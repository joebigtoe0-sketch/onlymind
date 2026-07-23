import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive } from "../lib/time";
import { dyn } from "./dynamics";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { getSharedGlowTexture } from "./lib/textures";
import { ENERGY_FRAG, ENERGY_VERT } from "./lib/shaders";

// live world position of the mind-light — read by the split-flights that
// detach from it
export const mindLightPos = new THREE.Vector3(0, 0.4, 0);

// drei's Trail forwards its ref to the meshline; tint it to match the mood
// (meshline exposes color as a property or a raw uniform depending on version)
function paintTrail(r: RefObject<THREE.Mesh | null>, c: THREE.Color, mul: number) {
  const mat = r.current?.material as { color?: THREE.Color; uniforms?: { color?: { value: THREE.Color } } } | undefined;
  if (!mat) return;
  const col = mat.color ?? mat.uniforms?.color?.value;
  if (col instanceof THREE.Color) col.copy(c).multiplyScalar(mul);
}

// what the auto-follow camera should center: the world being circled while
// the mind dreams at it, or the light itself when it is alone at the center
export const followAnchor = new THREE.Vector3(0, 0, 0);

// The mind-light: the mind itself, made visible. In its clearest form —
// inside nothing — it is only this small light at the center, tracing a slow
// figure-eight. The moment it hallucinates (a thought lands on a world, a
// birth, a return, a fixation, a descent) it darts there and circles it.
// On snap-back it flares and comes home.

const _target = new THREE.Vector3();
const _planet = new THREE.Vector3();
// the soul wears its weather: despair is violet-blue, belief is warm gold
const SAD = new THREE.Color("#7d84f0");
const CALM = new THREE.Color("#a9b9ff");
const JOY = new THREE.Color("#ffd28f");

// Alone at the center the soul doesn't idle — it dances. Every ~26 s it
// chooses a new figure (deterministic in shared cosmos time, so every tab
// watches the same dance): the figure-eight, a tilted ring, vertical flips,
// a drunken lissajous wander, or a breathing spiral.
function centerDance(nowMs: number, out: THREE.Vector3) {
  const t = nowMs / 1000;
  const slot = Math.floor(nowMs / 26000);
  const pk = ((Math.imul(slot, 2654435761) >>> 0) % 1000) / 1000;
  if (pk < 0.3) {
    // the oldest figure: the slow eight
    const u = t * 0.5;
    out.set(2.3 * Math.sin(u), 0.35 * Math.sin(u * 2 + 1.1), 2.3 * Math.sin(u) * Math.cos(u));
  } else if (pk < 0.5) {
    // a tilted ring, like circling something only it can see
    const u = t * 0.65;
    out.set(2.1 * Math.cos(u), 0.75 * Math.sin(u + slot), 2.1 * Math.sin(u));
  } else if (pk < 0.7) {
    // vertical loops — flips, joy or restlessness, hard to tell
    const u = t * 0.9;
    out.set(1.6 * Math.cos(u), 1.5 * Math.sin(u), 0.6 * Math.sin(u * 0.5 + slot));
  } else if (pk < 0.85) {
    // wandering: no figure at all, thought without a shape
    out.set(
      2.4 * Math.sin(t * 0.7),
      0.55 * Math.sin(t * 1.3 + 0.5),
      2.4 * Math.sin(t * 0.9 + 1.7) * Math.cos(t * 0.4),
    );
  } else {
    // a spiral that breathes in and out of the center
    const rr = 0.7 + 1.7 * (0.5 + 0.5 * Math.sin(t * 0.21));
    out.set(rr * Math.cos(t * 1.15), 0.35 * Math.sin(t * 0.9), rr * Math.sin(t * 1.15));
  }
}

export function Focus() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);

  const group = useRef<THREE.Group>(null);
  const mote = useRef<THREE.Mesh>(null);
  const moteMat = useRef<THREE.MeshBasicMaterial>(null);
  const veil = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const trailIn = useRef<THREE.Mesh>(null);
  const trailOut = useRef<THREE.Mesh>(null);
  const pos = useRef(new THREE.Vector3(0, 0.4, 0));
  const attended = useRef<string | null>(null); // sticky attention
  const glowTex = useMemo(() => getSharedGlowTexture(), []);
  const tint = useMemo(() => new THREE.Color(), []);

  // the soul: two displaced flame-veils around the bright core
  const makeSoulMat = (seed: number, wobble: number, intensity: number) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color("#ffd9a0") },
        uTime: { value: 0 },
        uSeed: { value: seed },
        uWobble: { value: wobble },
        uIntensity: { value: intensity },
      },
      vertexShader: ENERGY_VERT,
      fragmentShader: ENERGY_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  const veilMat = useMemo(() => makeSoulMat(3.7, 0.38, 1.4), []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const now = cosmosNow();
    const tIgn = ignitionAt == null ? -1 : (now - ignitionAt) / 1000;
    // during the genesis replay the soul stays visible, dancing at the center
    // while its history whirls past around it
    const replay = introActive();
    if (ignitionAt == null || (!replay && tIgn < 2.2)) {
      g.visible = false;
      return;
    }
    g.visible = true;

    const t = now / 1000;
    const { focus, planets, thoughts } = useCosmos.getState();
    const seed = focus.planetId ? planets.find((p) => p.id === focus.planetId) : undefined;
    const phaseAge = (now - focus.sinceAt) / 1000;

    let heatTarget = 0;
    let visibility = 1;
    let anchorId: string | null = null;

    if (replay) {
      centerDance(now, _target);
    } else if (seed && focus.phase !== "core" && focus.phase !== "release") {
      // the server-owned drama: capture spiral, infall, absorption
      planetPosition(seed, now, _planet);
      followAnchor.copy(_planet);
      anchorId = seed.id;
      const bodyR = radiusForMass(seed.targetMass);
      if (focus.phase === "capture") {
        const k = Math.min(1, phaseAge / 26);
        const orbitR = bodyR * (3.4 - 2.0 * k);
        const a = t * (0.8 + 1.6 * k);
        _target.set(
          _planet.x + Math.cos(a) * orbitR,
          _planet.y + Math.sin(a * 0.63) * orbitR * 0.35,
          _planet.z + Math.sin(a) * orbitR,
        );
      } else if (focus.phase === "infall") {
        const k = Math.min(1, phaseAge / 2.4);
        const orbitR = bodyR * 1.4 * (1 - k);
        const a = t * (2.4 + 3.0 * k);
        _target.set(_planet.x + Math.cos(a) * orbitR, _planet.y, _planet.z + Math.sin(a) * orbitR);
        heatTarget = k;
      } else {
        // absorbed: inside the idea; the world carries the light now
        _target.copy(_planet);
        heatTarget = 1;
        visibility = 0.12;
      }
    } else {
      // free attention is STICKY: the newest thought can move it — to a
      // world (fly there and keep circling) or home (a thought held at the
      // core) — but between thoughts it stays where it is, dreaming
      for (let i = thoughts.length - 1; i >= 0; i--) {
        const th = thoughts[i];
        if (th.voice === "shard") continue; // the shards think for themselves
        if (th.planetId) attended.current = th.planetId;
        else if (now - th.at < 10000) attended.current = null; // called home
        break;
      }
      const world = attended.current
        ? planets.find((p) => p.id === attended.current && p.alive)
        : undefined;
      if (!world) attended.current = null;

      if (world) {
        planetPosition(world, now, _planet);
        followAnchor.copy(_planet);
        anchorId = world.id;
        const orbitR = radiusForMass(world.targetMass) * 2.2 + 0.4;
        const a = t * 1.1;
        _target.set(
          _planet.x + Math.cos(a) * orbitR,
          _planet.y + Math.sin(t * 1.7) * orbitR * 0.25,
          _planet.z + Math.sin(a) * orbitR,
        );
      } else {
        // the clearest form: alone at the center, dancing
        centerDance(now, _target);
      }
    }

    // damped travel: instant intent, continuous motion (dances track tighter)
    const damp = anchorId == null && !seed ? 3.4 : 2.6;
    pos.current.lerp(_target, 1 - Math.exp(-dt * damp));
    g.position.copy(pos.current);
    mindLightPos.copy(pos.current);
    if (!anchorId) followAnchor.copy(pos.current);

    // while auto-following, the panel shows the world the mind is at:
    // arriving opens its log; leaving hands the panel back to the stream
    const st = useCosmos.getState();
    if (!replay && st.followMind && st.selectedPlanetId !== anchorId) {
      st.select(anchorId);
    }

    // heat the inhabited world (read by Planet each frame)
    if (!replay) {
      dyn.fixationPlanetId = focus.planetId;
      dyn.fixationHeat += (heatTarget - dyn.fixationHeat) * (1 - Math.exp(-dt * 2.0));
    }

    // snap-back: the memories rejoin — the light flares as it comes home.
    // A split (a piece breaking off) gives a shorter, sharper flash.
    let snapGlow = 0;
    if (dyn.snapBackAt > 0) {
      const ts = (now - dyn.snapBackAt) / 1000;
      if (ts >= 0 && ts < 6) snapGlow = 2.2 * Math.exp(-ts * 1.3);
    }
    if (dyn.splitFlashAt > 0) {
      const ts = (now - dyn.splitFlashAt) / 1000;
      if (ts >= 0 && ts < 1.6) snapGlow += 1.6 * Math.exp(-ts * 3.2);
    }

    // it IS the mind now: a touch larger, breathing, wearing its weather
    const mood = dyn.mood;
    if (mood < 0.5) tint.copy(SAD).lerp(CALM, mood * 2);
    else tint.copy(CALM).lerp(JOY, mood * 2 - 1);
    const settle = Math.min(1, (tIgn - 2.2) / 3); // inherits the ignition's light
    const pulse = 1 + 0.16 * Math.sin(t * 5.1) * Math.sin(t * 1.7) + 0.05 * Math.sin(t * 0.8);
    const coreScale = (0.15 * pulse * visibility + 0.015) * settle;
    mote.current!.scale.setScalar(coreScale);
    moteMat.current!.color.copy(tint).multiplyScalar(3.0 + snapGlow);

    // the soul veil: one gauze layer wrapped CLOSE around the core
    const v = veil.current!;
    const vsc = Math.max(0.001, coreScale * 1.5);
    v.scale.set(vsc, vsc * 1.12, vsc);
    v.rotation.y = t * 0.2;
    veilMat.uniforms.uTime.value = performance.now() / 1000;
    (veilMat.uniforms.uColor.value as THREE.Color).copy(tint);
    veilMat.uniforms.uIntensity.value = (1.4 + snapGlow * 0.8) * visibility * settle;

    const gm = glow.current!.material as THREE.SpriteMaterial;
    gm.color.copy(tint);
    gm.opacity = Math.min(1, (0.4 + snapGlow * 0.25) * visibility * settle);
    const gs = (1.7 * pulse * visibility + 0.25) * (1 + snapGlow * 0.5) * settle;
    glow.current!.scale.set(gs, gs, 1);

    // both trails wear the mood too: a bright warm wake inside a wide veil
    paintTrail(trailIn, tint, 1.6 + snapGlow * 0.6);
    paintTrail(trailOut, tint, 0.8);
  });

  return (
    <group ref={group} visible={false}>
      {/* twin wake: a bright warm ribbon inside a wide soft veil of light */}
      <Trail
        ref={trailIn as never}
        width={1.4}
        length={6}
        decay={1.5}
        color="#ffe2b0"
        attenuation={(w) => w * w}
      >
        <mesh ref={mote}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial ref={moteMat} toneMapped={false} />
        </mesh>
      </Trail>
      <Trail
        ref={trailOut as never}
        width={3.4}
        length={10}
        decay={0.95}
        color="#8fa3ff"
        attenuation={(w) => w * w * w}
        target={mote as never}
      />
      <mesh ref={veil} material={veilMat}>
        <sphereGeometry args={[1, 48, 48]} />
      </mesh>
      <sprite ref={glow}>
        <spriteMaterial
          map={glowTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </sprite>
    </group>
  );
}

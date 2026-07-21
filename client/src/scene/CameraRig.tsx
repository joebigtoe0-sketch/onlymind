import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { mindLightPos } from "./Focus";
import { reportCameraInterest } from "../net/socket";

// Free-fly spectator camera. After ignition it slowly pulls back to reveal
// the cosmos — until the spectator takes over. Clicking a world locks the
// camera's focus onto it: the orbit target tracks the moving planet and the
// camera eases to a close-up. Esc or clicking the void releases the lock.

const _planet = new THREE.Vector3();
const _dir = new THREE.Vector3();
const ORIGIN = new THREE.Vector3(0, 0, 0);

export function CameraRig() {
  const ignitionAt = useCosmos((s) => s.ignitionAt);
  const selectedPlanetId = useCosmos((s) => s.selectedPlanetId);
  const controls = useRef<any>(null);
  const interacted = useRef(false);
  const interestClock = useRef(0);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const el = gl.domElement;
    const mark = () => {
      interacted.current = true;
      if (controls.current) controls.current.autoRotate = false;
    };
    el.addEventListener("pointerdown", mark);
    el.addEventListener("wheel", mark, { passive: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useCosmos.getState().select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("pointerdown", mark);
      el.removeEventListener("wheel", mark);
      window.removeEventListener("keydown", onKey);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const ctl = controls.current;
    if (!ctl) return;

    // report what this camera sees (§4 camera-interest streaming)
    interestClock.current += dt;
    if (interestClock.current > 2) {
      interestClock.current = 0;
      const t = ctl.target as THREE.Vector3;
      const radius = Math.max(80, camera.position.distanceTo(t) * 2.5);
      reportCameraInterest([t.x, t.y, t.z], radius);
    }

    const selected = selectedPlanetId && !introActive()
      ? useCosmos.getState().planets.find((p) => p.id === selectedPlanetId)
      : undefined;

    if (selected) {
      // locked: the orbit target rides the moving world, camera eases close
      planetPosition(selected, cosmosNow(), _planet);
      ctl.target.lerp(_planet, 1 - Math.exp(-dt * 3.5));
      const want = radiusForMass(selected.targetMass) * 6 + 1.6;
      const cur = camera.position.distanceTo(ctl.target);
      const next = cur + (want - cur) * (1 - Math.exp(-dt * 1.6));
      _dir.copy(camera.position).sub(ctl.target).normalize().multiplyScalar(next);
      camera.position.copy(ctl.target).add(_dir);
      return;
    }

    // auto-follow: the camera's focus rides the mind-light itself
    if (useCosmos.getState().followMind && !introActive()) {
      ctl.target.lerp(mindLightPos, 1 - Math.exp(-dt * 3));
      return;
    }

    // unlocked: target eases home
    if (ctl.target.lengthSq() > 0.0004) {
      ctl.target.lerp(ORIGIN, 1 - Math.exp(-dt * 2));
    }

    // opening reveal: slow dolly out until the spectator touches anything.
    // The reveal distance scales with the actual extent of the cosmos, so a
    // massive universe ends its genesis replay properly zoomed out.
    if (!interacted.current && ignitionAt != null) {
      const t = (sceneNow() - ignitionAt) / 1000;
      if (t > 2.5) {
        let maxR = 18;
        for (const p of useCosmos.getState().planets) {
          if (p.parentId == null) {
            maxR = Math.max(maxR, p.orbitRadius + (p.diedAt != null ? 34 : 0));
          }
        }
        const reveal = Math.min(170, maxR * 1.5 + 14);
        const r = camera.position.length();
        // the replay pulls back faster — it has more ground to cover
        const rate = introActive() ? 0.24 : 0.055;
        const next = r + (reveal - r) * (1 - Math.exp(-dt * rate));
        camera.position.setLength(next);
      }
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.5}
      zoomSpeed={0.7}
      autoRotate
      autoRotateSpeed={0.12}
      minDistance={1.2}
      maxDistance={400}
    />
  );
}

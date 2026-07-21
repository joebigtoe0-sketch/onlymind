import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive } from "../lib/time";
import { dyn } from "./dynamics";
import { planetPosition } from "./lib/orbit";
import { dwellerPosition } from "./Dwellers";
import { mindLightPos } from "./Focus";
import { getSharedGlowTexture } from "./lib/textures";

// The split made visible: every new piece of the cosmos — a dreamed world, a
// body for a sky, a holder-shard — detaches from the mind-light where it is
// right now and flies to where it belongs. The light flashes as it tears.

const POOL = 10;
const FLIGHT_MS = 2200;

type Flight = {
  kind: "planet" | "dweller";
  targetId: string;
  from: THREE.Vector3;
  t0: number; // performance.now epoch
};

const _to = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function SplitFlights() {
  const planets = useCosmos((s) => s.planets);
  const dwellers = useCosmos((s) => s.dwellers);

  const flights = useRef<Flight[]>([]);
  const knownPlanets = useRef<Set<string> | null>(null);
  const knownDwellers = useRef<Set<string> | null>(null);
  const motes = useRef<(THREE.Group | null)[]>([]);
  const glowTex = useMemo(() => getSharedGlowTexture(), []);

  useEffect(() => {
    // first sight (snapshot) is history, not news — no flights for it
    if (knownPlanets.current == null) {
      knownPlanets.current = new Set(planets.map((p) => p.id));
      return;
    }
    for (const p of planets) {
      if (knownPlanets.current.has(p.id)) continue;
      knownPlanets.current.add(p.id);
      if (introActive()) continue;
      flights.current.push({
        kind: "planet",
        targetId: p.id,
        from: mindLightPos.clone(),
        t0: performance.now(),
      });
      dyn.splitFlashAt = cosmosNow();
    }
  }, [planets]);

  useEffect(() => {
    if (knownDwellers.current == null) {
      knownDwellers.current = new Set(dwellers.map((d) => d.id));
      return;
    }
    for (const d of dwellers) {
      if (knownDwellers.current.has(d.id)) continue;
      knownDwellers.current.add(d.id);
      if (introActive()) continue;
      flights.current.push({
        kind: "dweller",
        targetId: d.id,
        from: mindLightPos.clone(),
        t0: performance.now(),
      });
      dyn.splitFlashAt = cosmosNow();
    }
  }, [dwellers]);

  useFrame(() => {
    const now = performance.now();
    const cNow = cosmosNow();
    const st = useCosmos.getState();
    flights.current = flights.current.filter((f) => now - f.t0 < FLIGHT_MS);

    for (let i = 0; i < POOL; i++) {
      const g = motes.current[i];
      if (!g) continue;
      const f = flights.current[i];
      if (!f || introActive()) {
        g.visible = false;
        continue;
      }

      // resolve the (moving) destination
      let ok = false;
      if (f.kind === "planet") {
        const p = st.planets.find((x) => x.id === f.targetId);
        if (p) {
          planetPosition(p, cNow, _to);
          ok = true;
        }
      } else {
        const d = st.dwellers.find((x) => x.id === f.targetId);
        const home = d ? st.planets.find((x) => x.id === d.planetId) : undefined;
        if (d && home) {
          dwellerPosition(d, home, cNow, _to);
          ok = true;
        }
      }
      if (!ok) {
        g.visible = false;
        continue;
      }

      g.visible = true;
      const k = Math.min(1, (now - f.t0) / FLIGHT_MS);
      const ease = k * k * (3 - 2 * k);
      g.position.lerpVectors(f.from, _to, ease);
      // a slight arc above the straight line, so it reads as flight
      g.position.addScaledVector(_up, Math.sin(k * Math.PI) * 1.6);
      const scale = 0.11 * (1 - 0.35 * k) * (k < 0.08 ? k / 0.08 : 1);
      g.scale.setScalar(Math.max(0.001, scale));
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            motes.current[i] = el;
          }}
          visible={false}
        >
          <mesh>
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial color={[3.4, 2.9, 2.0]} toneMapped={false} />
          </mesh>
          <sprite scale={[9, 9, 1]}>
            <spriteMaterial
              map={glowTex}
              color="#ffe2b0"
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.5}
            />
          </sprite>
        </group>
      ))}
    </>
  );
}

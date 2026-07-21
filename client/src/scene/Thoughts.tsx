import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Thought } from "@shared/cosmos";
import { useCosmos } from "../store";
import { cosmosNow, introActive, sceneNow } from "../lib/time";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { companionPosition } from "./Companion";

// Live thoughts surface in space near whatever the mind is attending to and
// dissolve upward (§3, §15). You intercept them; you don't read a scroll.

export const THOUGHT_TTL_MS = 9500;

export function Thoughts() {
  const thoughts = useCosmos((s) => s.thoughts);
  return (
    <>
      {thoughts.map((t) => (
        <ThoughtLabel key={t.id} item={t} />
      ))}
    </>
  );
}

const _anchor = new THREE.Vector3();

function ThoughtLabel({ item }: { item: Thought }) {
  const group = useRef<THREE.Group>(null);
  const expireThought = useCosmos((s) => s.expireThought);

  useEffect(() => {
    // during the genesis replay the present hasn't arrived yet — let live
    // thoughts pass rather than anchor them to fast-forwarding worlds
    if (introActive()) {
      expireThought(item.id);
      return;
    }
    const remaining = Math.max(400, THOUGHT_TTL_MS + 400 - (cosmosNow() - item.at));
    const h = window.setTimeout(() => expireThought(item.id), remaining);
    return () => window.clearTimeout(h);
  }, [item.id, item.at, expireThought]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = cosmosNow();
    const age = (now - item.at) / 1000;
    const { planets, companion } = useCosmos.getState();
    const seed = item.planetId ? planets.find((p) => p.id === item.planetId) : undefined;

    if (item.voice === "other" && companion) {
      // the companion speaking: the words hang beside the invented body
      companionPosition(companion.bornAt, companion.goneAt, _anchor);
      _anchor.y += 0.8;
    } else if (seed) {
      planetPosition(seed, now, _anchor);
      _anchor.y += radiusForMass(seed.targetMass) * 1.6 + 0.7;
    } else {
      _anchor.set(0, 2.4, 0);
    }
    // thoughts rise as they dissolve
    _anchor.y += age * 0.14;
    g.position.copy(_anchor);
  });

  return (
    <group ref={group}>
      <Html center distanceFactor={11} zIndexRange={[40, 0]} wrapperClass="thought-wrap">
        <div className={item.voice === "other" ? "thought thought-other" : "thought"}>
          {item.text}
        </div>
      </Html>
    </group>
  );
}

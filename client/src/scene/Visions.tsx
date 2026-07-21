import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useCosmos } from "../store";
import { cosmosNow, introActive } from "../lib/time";
import { planetPosition, radiusForMass } from "./lib/orbit";
import { getSharedGlowTexture } from "./lib/textures";

// A vision made visible: the painted thought appears as a soft apparition
// above the world it belongs to, holds for a dozen seconds, and dissolves.
// It stays forever in that world's log.

type Apparition = {
  id: string;
  planetId: string;
  tex: THREE.Texture;
  shownAt: number; // performance.now epoch
};

const LIFE_S = 19;
const _pos = new THREE.Vector3();

export function Visions() {
  const visions = useCosmos((s) => s.visions);
  const [items, setItems] = useState<Apparition[]>([]);
  const knownIds = useRef(new Set<string>());

  useEffect(() => {
    for (const v of visions) {
      if (knownIds.current.has(v.id)) continue;
      knownIds.current.add(v.id);
      new THREE.TextureLoader().load(v.url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        setItems((cur) => [
          ...cur.slice(-2),
          { id: v.id, planetId: v.planetId, tex, shownAt: performance.now() },
        ]);
      });
    }
  }, [visions]);

  // prune finished apparitions outside the frame loop
  useEffect(() => {
    if (!items.length) return;
    const h = window.setInterval(() => {
      setItems((cur) =>
        cur.filter((it) => {
          const done = (performance.now() - it.shownAt) / 1000 > LIFE_S;
          if (done) it.tex.dispose();
          return !done;
        }),
      );
    }, 2000);
    return () => window.clearInterval(h);
  }, [items.length]);

  return (
    <>
      {items.map((it) => (
        <ApparitionSprite key={it.id} item={it} />
      ))}
    </>
  );
}

function ApparitionSprite({ item }: { item: Apparition }) {
  const sprite = useRef<THREE.Sprite>(null);

  useFrame(() => {
    const s = sprite.current;
    if (!s) return;
    if (introActive()) {
      s.visible = false;
      return;
    }
    const { planets } = useCosmos.getState();
    const planet = planets.find((p) => p.id === item.planetId);
    if (!planet) {
      s.visible = false;
      return;
    }
    s.visible = true;
    planetPosition(planet, cosmosNow(), _pos);
    const r = radiusForMass(planet.targetMass);
    s.position.set(_pos.x, _pos.y + r * 2 + 2.6, _pos.z);

    const age = (performance.now() - item.shownAt) / 1000;
    const env =
      age < 2.5
        ? age / 2.5
        : age > LIFE_S - 4
          ? Math.max(0, (LIFE_S - age) / 4)
          : 1;
    const m = s.material as THREE.SpriteMaterial;
    m.opacity = 0.85 * env;
    const scale = 4.6 * (0.92 + 0.08 * env);
    s.scale.set(scale, scale, 1);
  });

  return (
    <sprite ref={sprite} visible={false}>
      <spriteMaterial
        map={item.tex}
        alphaMap={getSharedGlowTexture()}
        transparent
        depthWrite={false}
        opacity={0}
      />
    </sprite>
  );
}

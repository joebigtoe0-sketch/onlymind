import { create } from "zustand";
import type {
  Companion,
  FocusState,
  Fragment,
  Mark,
  Planet,
  Thought,
  Vision,
  CosmicEvent,
} from "@shared/cosmos";
import { dyn } from "./scene/dynamics";
import { cosmosNow } from "./lib/time";

// The client store is a pure mirror of the server's cosmos (§4): a snapshot
// on join, then cosmic events applied from 10 Hz deltas. The only local state
// is the spectator's own selection.

export type { Planet, Thought, FocusState, Fragment, Companion, Mark, Vision };

type CosmosStore = {
  connected: boolean;
  ignitionAt: number | null; // server epoch ms
  planets: Planet[];
  thoughts: Thought[]; // live ones; labels expire themselves
  stream: Thought[]; // the demoted raw feed (§3), last ~60
  focus: FocusState;
  depth: number;
  activePlanetId: string | null;
  fragments: Fragment[]; // the active descent's split tree
  companion: Companion | null;
  marks: Mark[];
  visions: Vision[]; // recent live ones (apparitions); history lives in logs
  selectedPlanetId: string | null;
  setConnected: (v: boolean) => void;
  applySnapshot: (s: {
    ignitionAt: number | null;
    planets: Planet[];
    thoughts: Thought[];
    focus: FocusState;
    depth: number;
    activePlanetId: string | null;
    fragments: Fragment[];
    companion: Companion | null;
    marks: Mark[];
  }) => void;
  applyEvents: (events: CosmicEvent[]) => void;
  mergeBodies: (planets: Planet[]) => void;
  expireThought: (id: string) => void;
  select: (id: string | null) => void;
};

export const useCosmos = create<CosmosStore>()((set) => ({
  connected: false,
  ignitionAt: null,
  planets: [],
  thoughts: [],
  stream: [],
  focus: { phase: "core", planetId: null, sinceAt: 0 },
  depth: 0,
  activePlanetId: null,
  fragments: [],
  companion: null,
  marks: [],
  visions: [],
  selectedPlanetId: null,
  setConnected: (v) => set({ connected: v }),
  applySnapshot: (s) =>
    set({
      ignitionAt: s.ignitionAt,
      planets: s.planets,
      thoughts: s.thoughts,
      stream: s.thoughts,
      focus: s.focus,
      depth: s.depth,
      activePlanetId: s.activePlanetId,
      fragments: s.fragments,
      companion: s.companion,
      marks: s.marks,
      selectedPlanetId: null,
    }),
  applyEvents: (events) =>
    set((st) => {
      let { ignitionAt, planets, thoughts, stream, focus, depth, activePlanetId, fragments, companion, marks, visions, selectedPlanetId } = st;
      for (const ev of events) {
        if (ev.kind === "birth") {
          if (ignitionAt == null) ignitionAt = ev.planet.bornAt; // safety net
          if (!planets.some((p) => p.id === ev.planet.id)) planets = [...planets, ev.planet];
        } else if (ev.kind === "recur") {
          planets = planets.map((p) =>
            p.id === ev.planetId
              ? { ...p, targetMass: ev.targetMass, returns: ev.returns }
              : p,
          );
        } else if (ev.kind === "thought") {
          thoughts = [...thoughts.slice(-5), ev.thought];
          stream = [...stream.slice(-59), ev.thought];
        } else if (ev.kind === "companion") {
          companion = ev.companion.goneAt != null ? ev.companion : ev.companion;
          if (ev.companion.goneAt != null) {
            // keep the cold body on screen a while, then let it go
            const gone = ev.companion;
            window.setTimeout(() => {
              const cur = useCosmos.getState().companion;
              if (cur && cur.name === gone.name && cur.goneAt != null) {
                useCosmos.setState({ companion: null });
              }
            }, 45000);
          }
        } else if (ev.kind === "mark") {
          marks = marks.some((m) => m.id === ev.mark.id)
            ? marks.map((m) => (m.id === ev.mark.id ? ev.mark : m))
            : [...marks, ev.mark];
        } else if (ev.kind === "vision") {
          visions = [...visions.slice(-5), ev.vision];
        } else if (ev.kind === "focus") {
          focus = ev.focus;
        } else if (ev.kind === "descend") {
          depth = 1;
          activePlanetId = ev.planetId;
          fragments = [ev.fragment];
          // the camera follows the mind down — unless the spectator is
          // already holding something of their own (Esc releases)
          if (selectedPlanetId == null) selectedPlanetId = ev.planetId;
        } else if (ev.kind === "split") {
          depth = ev.fragment.depth;
          fragments = [...fragments, ev.fragment];
        } else if (ev.kind === "doubt") {
          dyn.doubtUntil = cosmosNow() + 14000; // the world flickers
        } else if (ev.kind === "snap_back") {
          if (ev.diedAt != null) {
            // fatal: the world goes cold and drifts to the debris field
            planets = planets.map((p) =>
              p.id === ev.planetId ? { ...p, alive: false, diedAt: ev.diedAt } : p,
            );
          }
          depth = 0;
          activePlanetId = null;
          fragments = [];
          dyn.doubtUntil = 0;
          dyn.snapBackAt = ev.diedAt ?? cosmosNow(); // the core flares either way
        }
      }
      return { ignitionAt, planets, thoughts, stream, focus, depth, activePlanetId, fragments, companion, marks, visions, selectedPlanetId };
    }),
  mergeBodies: (incoming) =>
    set((st) => {
      const known = new Set(st.planets.map((p) => p.id));
      const fresh = incoming.filter((p) => !known.has(p.id));
      return fresh.length ? { planets: [...st.planets, ...fresh] } : {};
    }),
  expireThought: (id) =>
    set((s) => ({ thoughts: s.thoughts.filter((t) => t.id !== id) })),
  select: (id) => set({ selectedPlanetId: id }),
}));

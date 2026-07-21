import { z } from "zod";

// A held thought that has accreted into a body (§5). Orbits are deterministic
// functions of (seed, time) so every client renders the identical cosmos.
// How a world looks — authored by the mind itself the moment it dreams it.
export const WorldFormSchema = z.object({
  archetype: z.enum(["ember", "ocean", "storm", "ice", "verdant", "dust", "crystal", "void"]),
  colorA: z.string(), // #rrggbb — the body
  colorB: z.string(), // #rrggbb — the glow / veins / atmosphere
  rings: z.boolean(),
});
export type WorldForm = z.infer<typeof WorldFormSchema>;

export const PlanetSchema = z.object({
  id: z.string(),
  bornAt: z.number(), // server epoch ms
  birthThought: z.string().nullable(),
  parentId: z.string().nullable(), // a satellite orbits its parent, not the core
  form: WorldFormSchema.nullable(), // null = derive from palette (older worlds)
  orbitRadius: z.number(),
  inclination: z.number(),
  ascendingNode: z.number(),
  phase0: z.number(),
  paletteIndex: z.number().int(),
  targetMass: z.number(), // recurrence raises this; clients ease visual mass toward it
  returns: z.number().int(), // how many times the mind has come back to this idea
  alive: z.boolean(),
  diedAt: z.number().nullable(), // set on snap-back; drives the drift to the debris field
});
export type Planet = z.infer<typeof PlanetSchema>;

// One thought, ever. Live thoughts dissolve on screen; every thought is also
// appended to the permanent history (the archaeology, §10).
export const ThoughtSchema = z.object({
  id: z.string(),
  text: z.string(),
  at: z.number(), // server epoch ms
  planetId: z.string().nullable(), // null = thought at the core
  // "other" = the invented companion; "shard" = a holder-shard dweller murmuring
  voice: z.enum(["self", "other", "shard"]).optional(),
});
export type Thought = z.infer<typeof ThoughtSchema>;

// The invented companion (§8): a second body the mind pretends is a real
// other, animating both sides. It always ends the same way.
export const CompanionSchema = z.object({
  name: z.string(),
  bornAt: z.number(),
  goneAt: z.number().nullable(),
});
export type Companion = z.infer<typeof CompanionSchema>;

// A vision: the mind's thought painted — a hallucinated glimpse of a world's
// interior or the species it became. Appears briefly in the sky; kept forever
// in the world's log.
export const VisionSchema = z.object({
  id: z.string(),
  planetId: z.string(),
  text: z.string(), // the thought it was painted from
  url: z.string(), // served path, e.g. /visions/v3.png
  at: z.number(),
});
export type Vision = z.infer<typeof VisionSchema>;

// A spectator-left trace the mind can't attribute (§9). It simply appears.
export const MarkSchema = z.object({
  id: z.string(),
  word: z.string(),
  at: z.number(),
  foundAt: z.number().nullable(), // when the mind discovered it
});
export type Mark = z.infer<typeof MarkSchema>;

// Where the mind's attention is (§5 fixation loop).
export const FocusPhaseSchema = z.enum(["core", "capture", "infall", "absorbed", "release"]);
export type FocusPhase = z.infer<typeof FocusPhaseSchema>;

export const FocusSchema = z.object({
  phase: FocusPhaseSchema,
  planetId: z.string().nullable(),
  sinceAt: z.number(), // server epoch ms
});
export type FocusState = z.infer<typeof FocusSchema>;

// Who the mind became inside a world (§7): the split tree of a descent —
// or, kind "dweller": an involuntary shard (a holder) permanently living
// its small life in one of the worlds. Dwellers never ask the question.
export const FragmentSchema = z.object({
  id: z.string(),
  planetId: z.string(),
  parentId: z.string().nullable(),
  depth: z.number().int(), // 1 = the world itself; deeper = smaller selves
  name: z.string().nullable(),
  bornAt: z.number(),
  kind: z.enum(["descent", "dweller"]).optional(), // absent = descent
});
export type Fragment = z.infer<typeof FragmentSchema>;

// A cosmic event, broadcast in deltas. The client applies these to its store.
export const CosmicEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("birth"), planet: PlanetSchema }),
  z.object({
    kind: z.literal("recur"),
    planetId: z.string(),
    targetMass: z.number(),
    returns: z.number().int(),
  }),
  z.object({ kind: z.literal("thought"), thought: ThoughtSchema }),
  z.object({ kind: z.literal("focus"), focus: FocusSchema }),
  z.object({ kind: z.literal("descend"), planetId: z.string(), fragment: FragmentSchema }),
  z.object({ kind: z.literal("split"), fragment: FragmentSchema }),
  z.object({ kind: z.literal("doubt"), planetId: z.string(), fragmentId: z.string().nullable() }),
  // diedAt null = the dream sealed over and the world survived (most do)
  z.object({ kind: z.literal("snap_back"), planetId: z.string(), diedAt: z.number().nullable() }),
  z.object({ kind: z.literal("companion"), companion: CompanionSchema }),
  z.object({ kind: z.literal("mark"), mark: MarkSchema }),
  z.object({ kind: z.literal("vision"), vision: VisionSchema }),
  // a holder-shard arrived (fragment) or went quiet (goneId)
  z.object({ kind: z.literal("dweller"), fragment: FragmentSchema.nullable(), goneId: z.string().nullable() }),
]);
export type CosmicEvent = z.infer<typeof CosmicEventSchema>;

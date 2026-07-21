import { z } from "zod";
import {
  CompanionSchema,
  CosmicEventSchema,
  FocusSchema,
  FragmentSchema,
  MarkSchema,
  PlanetSchema,
  ThoughtSchema,
  VisionSchema,
} from "./cosmos";

// Ambient instruments (§3): how sure it is that it exists, how strongly it
// believes in an outside, how coherent it currently is. Rounded server-side.
export const InstrumentsSchema = z.object({
  certainty: z.number(),
  belief: z.number(),
  coherence: z.number(),
});
export type Instruments = z.infer<typeof InstrumentsSchema>;

// ---- server -> client -------------------------------------------------------

export const HelloMsg = z.object({
  type: z.literal("hello"),
  serverTime: z.number(),
  seed: z.string(),
});
export type Hello = z.infer<typeof HelloMsg>;

// Full state on join. Clients derive everything else from deltas + time.
export const SnapshotMsg = z.object({
  type: z.literal("snapshot"),
  serverTime: z.number(),
  tick: z.number(),
  ignitionAt: z.number().nullable(),
  mood: z.number(),
  planets: z.array(PlanetSchema),
  thoughts: z.array(ThoughtSchema), // only currently-live ones
  focus: FocusSchema,
  depth: z.number().int(),
  activePlanetId: z.string().nullable(),
  fragments: z.array(FragmentSchema), // the active descent's split tree
  companion: CompanionSchema.nullable(),
  marks: z.array(MarkSchema),
  instruments: InstrumentsSchema,
});
export type Snapshot = z.infer<typeof SnapshotMsg>;

// The 10 Hz incremental: mood plus any cosmic events since the last flush.
export const DeltaMsg = z.object({
  type: z.literal("delta"),
  tick: z.number(),
  serverTime: z.number(),
  mood: z.number(),
  instruments: InstrumentsSchema.optional(),
  events: z.array(CosmicEventSchema),
});
export type Delta = z.infer<typeof DeltaMsg>;

// Bodies within a client's camera interest (the cosmos outgrows broadcast).
export const BodiesMsg = z.object({
  type: z.literal("bodies"),
  planets: z.array(PlanetSchema),
});
export type Bodies = z.infer<typeof BodiesMsg>;

export const ServerMsg = z.discriminatedUnion("type", [HelloMsg, SnapshotMsg, DeltaMsg, BodiesMsg]);
export type ServerMessage = z.infer<typeof ServerMsg>;

// ---- client -> server -------------------------------------------------------

export const CameraInterestMsg = z.object({
  type: z.literal("camera_interest"),
  center: z.tuple([z.number(), z.number(), z.number()]),
  radius: z.number(),
});

export const OpenLogMsg = z.object({
  type: z.literal("open_log"),
  planetId: z.string(),
});

export const PingMsg = z.object({
  type: z.literal("ping"),
  t: z.number(),
});

export const ClientMsg = z.discriminatedUnion("type", [CameraInterestMsg, OpenLogMsg, PingMsg]);
export type ClientMessage = z.infer<typeof ClientMsg>;

// ---- REST payloads ----------------------------------------------------------

export const PlanetLogPayload = z.object({
  planet: PlanetSchema,
  ignitionAt: z.number().nullable(),
  thoughts: z.array(ThoughtSchema), // full history for this world
  fragments: z.array(FragmentSchema), // who the mind became here
  visions: z.array(VisionSchema), // the thoughts it painted here
});
export type PlanetLog = z.infer<typeof PlanetLogPayload>;

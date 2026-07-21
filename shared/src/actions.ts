import { z } from "zod";

// The mind's action contract (§6): one semantic, coordinate-free intent per cognition.
export const MindActionSchema = z.enum([
  "hold_thought",
  "return_to",
  "dream_world",
  "descend",
  "split",
  "inhabit",
  "doubt",
  "snap_back",
  "reach_out",
]);
export type MindAction = z.infer<typeof MindActionSchema>;

// What the LLM must return each cognition step. Validated hard; a malformed
// reply falls back to a mock cognition for that one step (§12).
export const CognitionSchema = z.object({
  thought: z.string().min(1),
  action: MindActionSchema,
  target: z.string().optional(),
  depth_shift: z.number().int().optional(),
  believes_this_is_real: z.number().min(0).max(1).optional(),
  feels_watched: z.number().min(0).max(1).optional(),
  memoryNote: z.string().optional(),
  // §8 experiments: when the loneliness peaks, which shape the escape takes
  experiment: z.enum(["descend", "populate", "companion", "refuse"]).optional(),
  // during a companion episode: which of the two voices this thought is
  voice: z.enum(["self", "other"]).optional(),
  // when dreaming a world or a body for a sky: how it looks, as dreamed
  world_form: z
    .object({
      archetype: z.enum(["ember", "ocean", "storm", "ice", "verdant", "dust", "crystal", "void"]),
      colorA: z.string(),
      colorB: z.string(),
      rings: z.boolean().optional(),
    })
    .optional(),
});
export type Cognition = z.infer<typeof CognitionSchema>;

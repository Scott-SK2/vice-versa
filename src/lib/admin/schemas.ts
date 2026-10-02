import { z } from "zod";

export const slideSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blank") }),
  z.object({ kind: z.literal("overview") }),
  z.object({ kind: z.literal("before_after"), questionKey: z.string() }),
  z.object({ kind: z.literal("tri_state_columns"), questionKey: z.string() }),
  z.object({ kind: z.literal("words"), questionKey: z.string() }),
  z.object({ kind: z.literal("approved_texts"), questionKey: z.string() }),
]);

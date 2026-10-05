import { z } from "zod";

// Only a string: the service parses it, so that a malformed reference answers
// the same 404 as one that names a card the caller may not see.
export const taskRefParamsSchema = z.object({ ref: z.string() });

export type TaskRefParams = z.infer<typeof taskRefParamsSchema>;

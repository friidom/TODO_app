import { z } from "zod";

import { FEED_PAGE, MAX_PAGE } from "../../config/constants.js";

export const feedQuerySchema = z.object({
  tab: z.enum(["assigned", "recent"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(FEED_PAGE),
});

export const workedOnQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(FEED_PAGE),
});

// A comma-separated list rather than repeated keys, and capped: these ids come
// from the caller's own localStorage, so the cap bounds the query rather than
// trusting the list's length.
export const byIdsQuerySchema = z.object({
  ids: z
    .string()
    .trim()
    .transform((raw) => raw.split(",").map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.uuid()).max(MAX_PAGE)),
});

export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type WorkedOnQuery = z.infer<typeof workedOnQuerySchema>;
export type ByIdsQuery = z.infer<typeof byIdsQuerySchema>;

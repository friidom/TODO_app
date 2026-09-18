import { z } from "zod";

import { FEED_PAGE, MAX_PAGE } from "../../config/constants.js";

export const feedQuerySchema = z.object({
  tab: z.enum(["assigned", "recent", "worked-on"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(FEED_PAGE),
});

export type FeedQuery = z.infer<typeof feedQuerySchema>;

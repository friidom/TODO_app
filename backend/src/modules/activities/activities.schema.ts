import { z } from "zod";

import { ACTIVITY_PAGE, MAX_PAGE } from "../../config/constants.js";

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(ACTIVITY_PAGE),
});

// The per-todo history is deliberately unbounded by default: a default limit
// would silently truncate a busy card's history.
export const todoActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).optional(),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type TodoActivityQuery = z.infer<typeof todoActivityQuerySchema>;

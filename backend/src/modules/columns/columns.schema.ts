import { z } from "zod";

// int4 is the column width, not an invented product rule: a larger value is an
// overflow rather than a big limit.
const INT4_MAX = 2_147_483_647;
const limit = z.coerce.number().int().min(0).max(INT4_MAX).nullable().optional();

// Title, order and existence are absent: those are the workflow's, and change
// only through PUT /boards/:boardId/workflow.
export const updateColumnSchema = z
  .object({
    min_limit: limit,
    max_limit: limit,
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "at least one field must be given",
  });

export const columnParamsSchema = z.object({ columnId: z.uuid() });

export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
export type ColumnParams = z.infer<typeof columnParamsSchema>;

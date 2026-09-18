import { z } from "zod";

const category = z.enum(["todo", "in_progress", "done"]);
const limit = z.coerce.number().int().min(0).nullable().optional();

export const createColumnSchema = z.object({
  title: z.string().trim().min(1).max(60),
  category,
});

// rank and position are absent: order is changed through /move, which writes
// one row, never through a general patch.
export const updateColumnSchema = z
  .object({
    title: z.string().trim().min(1).max(60).optional(),
    category: category.optional(),
    min_limit: limit,
    max_limit: limit,
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "at least one field must be given",
  });

// The client computed this rank from the two neighbours it dropped between.
// Recomputing it here would put the column somewhere else on every other
// client, so the server takes it and validates only that it is a real number.
export const moveColumnSchema = z.object({ rank: z.number().finite() });

export const deleteColumnSchema = z.object({ moveToColumnId: z.uuid() });

export const columnParamsSchema = z.object({ columnId: z.uuid() });

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
export type MoveColumnInput = z.infer<typeof moveColumnSchema>;
export type DeleteColumnInput = z.infer<typeof deleteColumnSchema>;
export type ColumnParams = z.infer<typeof columnParamsSchema>;

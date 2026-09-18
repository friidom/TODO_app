import { z } from "zod";

const WORK_TYPES = ["Bug", "Task", "Story", "Feature", "Epic"] as const;
const PRIORITIES = ["lowest", "low", "medium", "high", "highest"] as const;

const isoDate = z.coerce.date().nullable().optional();
const rank = z.number().finite().nullable().optional();

// todos_estimate_check: null or >= 0. null and 0 are different answers — an
// unestimated item is not a zero-point one — so this stays nullable.
const estimate = z.coerce.number().min(0).nullable().optional();

const writable = {
  title: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().max(20_000).nullable().optional(),
  column_id: z.uuid().nullable().optional(),
  type: z.enum(WORK_TYPES).optional(),
  priority: z.enum(PRIORITIES).nullable().optional(),
  start_date: isoDate,
  due_date: isoDate,
  estimate,
  assignee_id: z.uuid().nullable().optional(),
  parent_id: z.uuid().nullable().optional(),
  sprint_id: z.uuid().nullable().optional(),
  rank,
  backlog_rank: rank,
};

// id, board_id, board_key, creator_id, position, created_at and updated_at are
// absent. Zod strips unknown keys, so leaving them out is what makes them
// unsettable from a body.
export const createTodoSchema = z.object({
  id: z.uuid().optional(),
  ...writable,
  title: z.string().trim().min(1).max(500),
});

export const upsertTodoSchema = z
  .object(writable)
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "at least one field must be given",
  });

// The client computed this rank from the neighbours it dropped between;
// recomputing it here would put the card somewhere else on every other client.
export const moveTodoSchema = z.object({
  column_id: z.uuid(),
  rank: z.number().finite(),
});

export const todoParamsSchema = z.object({ todoId: z.uuid() });

export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpsertTodoInput = z.infer<typeof upsertTodoSchema>;
export type MoveTodoInput = z.infer<typeof moveTodoSchema>;
export type TodoParams = z.infer<typeof todoParamsSchema>;

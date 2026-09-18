import { z } from "zod";

// sprints_name_check: 1..120 after btrim.
const name = z.string().trim().min(1).max(120);
const isoDate = z.coerce.date().nullable().optional();

export const createSprintSchema = z.object({
  name,
  goal: z.string().trim().max(2000).nullable().optional(),
  start_date: isoDate,
  end_date: isoDate,
});

// state is absent, and that is the rule rather than an omission: the two
// transitions are /start and /complete, each of which is more than one write.
export const updateSprintSchema = z
  .object({
    name: name.optional(),
    goal: z.string().trim().max(2000).nullable().optional(),
    start_date: isoDate,
    end_date: isoDate,
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "at least one field must be given",
  });

// An absent moveToSprintId and an explicit null both mean the Backlog.
export const completeSprintSchema = z.object({
  moveToSprintId: z.uuid().nullable().optional(),
});

export const sprintParamsSchema = z.object({ sprintId: z.uuid() });

export type CreateSprintInput = z.infer<typeof createSprintSchema>;
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;
export type CompleteSprintInput = z.infer<typeof completeSprintSchema>;
export type SprintParams = z.infer<typeof sprintParamsSchema>;

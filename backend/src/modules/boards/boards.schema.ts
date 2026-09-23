import { z } from "zod";

const title = z.string().trim().min(1).max(120);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// The client mints board ids so the optimistic row and the stored row are the
// same row (§12.3); an absent one is filled in server-side.
export const createBoardSchema = z.object({
  id: z.uuid().optional(),
  title,
  space_id: z.uuid().nullable().optional(),
});

// owner_id, next_key and key_prefix are absent on purpose. Unknown keys are
// stripped by Zod, so naming only these is what makes them unsettable.
export const updateBoardSchema = z
  .object({
    title: title.nullable().optional(),
    description: optionalText(2000),
    icon: optionalText(60),
    cover_color: optionalText(60),
    visibility: z.enum(["private", "team"]).optional(),
    space_id: z.uuid().nullable().optional(),
    // Board Settings > Features. Optional like everything else here, so a
    // toggle does not resend the name and a rename does not resend the toggles.
    sprints_enabled: z.boolean().optional(),
    workflow_enabled: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "at least one field must be given",
  });

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

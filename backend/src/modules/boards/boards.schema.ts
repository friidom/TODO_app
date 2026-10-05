import { z } from "zod";

import { BOARD_KEY_MESSAGES, boardKeyError, normalizeBoardKey } from "../../lib/boardKey.js";

const title = z.string().trim().min(1).max(120);

const boardKey = z
  .string()
  .superRefine((value, ctx) => {
    const error = boardKeyError(value);

    if (error) ctx.addIssue({ code: "custom", message: BOARD_KEY_MESSAGES[error] });
  })
  .transform(normalizeBoardKey);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// The client mints board ids so the optimistic row and the stored row are the
// same row (§12.3); an absent one is filled in server-side.
export const createBoardSchema = z.object({
  id: z.uuid().optional(),
  title,
  space_id: z.uuid().nullable().optional(),
});

// mode is a pattern rather than an enum: the view list is the client's, and it
// repairs a mode it no longer knows when it reads the board.
const viewTab = z.object({
  mode: z.string().regex(/^[a-z][a-z_]{0,31}$/),
  label: z.string().trim().min(1).max(40).nullable(),
  hidden: z.boolean(),
});

const viewTabs = z
  .array(viewTab)
  .max(20)
  .refine((tabs) => new Set(tabs.map((tab) => tab.mode)).size === tabs.length, {
    message: "each view may appear once",
  });

// owner_id and next_key are absent on purpose. Unknown keys are stripped by
// Zod, so naming only these is what makes them unsettable. createBoardSchema
// has no key_prefix either: a new board's key is derived from its title.
export const updateBoardSchema = z
  .object({
    title: title.nullable().optional(),
    description: optionalText(2000),
    icon: optionalText(60),
    cover_color: optionalText(60),
    visibility: z.enum(["private", "team"]).optional(),
    space_id: z.uuid().nullable().optional(),
    key_prefix: boardKey.optional(),
    // Board Settings > Features. Optional like everything else here, so a
    // toggle does not resend the name and a rename does not resend the toggles.
    sprints_enabled: z.boolean().optional(),
    workflow_enabled: z.boolean().optional(),
    // null restores the default tab set (migration 0027).
    view_tabs: viewTabs.nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "at least one field must be given",
  });

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

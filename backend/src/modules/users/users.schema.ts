import { z } from "zod";

import { normalizeUsername, validateUsername } from "../../lib/username.js";

const username = z
  .string()
  .transform(normalizeUsername)
  .superRefine((value, ctx) => {
    const problem = validateUsername(value);

    if (problem !== undefined) ctx.addIssue({ code: "custom", message: problem });
  });

// id, email and created_at are absent: identity is not patchable, and email
// belongs to the auth module.
export const updateProfileSchema = z
  .object({
    username: username.optional(),
    full_name: z.string().trim().max(120).nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    avatar_url: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "at least one field must be given",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

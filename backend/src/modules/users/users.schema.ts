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
// belongs to the auth module. avatar_url is absent too, and that is a security
// boundary rather than tidiness: it used to be a free-text field the client
// chose, which let any account point its avatar at any url — including another
// user's object. It now changes only through POST/DELETE /users/me/avatar.
export const updateProfileSchema = z
  .object({
    username: username.optional(),
    full_name: z.string().trim().max(120).nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "at least one field must be given",
  });

// Both segments are re-validated rather than trusted: they arrive from a url
// and are concatenated into a storage key.
export const avatarObjectParamsSchema = z.object({
  userId: z.uuid(),
  object: z.string().max(64),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AvatarObjectParams = z.infer<typeof avatarObjectParamsSchema>;

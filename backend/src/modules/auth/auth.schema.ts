import { z } from "zod";

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "../../config/constants.js";
import { normalizeUsername, validateUsername } from "../../lib/username.js";

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_BYTES, `must be at most ${PASSWORD_MAX_BYTES} characters`);

const username = z
  .string()
  .transform(normalizeUsername)
  .superRefine((value, ctx) => {
    const problem = validateUsername(value);

    if (problem !== undefined) ctx.addIssue({ code: "custom", message: problem });
  });

const email = z.string().trim().max(254).pipe(z.email("must be a valid email address"));

export const registerSchema = z.object({ email, password, username });

// No length check: rejecting a short password before the lookup would leak
// which accounts exist, the thing the identical 401 exists to hide.
export const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

// Not the strict `email` above: this endpoint always answers 200, so a
// malformed address must take the same path as an unknown one, not a 400.
export const forgotPasswordSchema = z.object({ email: z.string().trim().min(1).max(254) });

export const resetPasswordSchema = z.object({ token: z.string().min(1), password });

export const usernameAvailableSchema = z.object({ username: z.string().min(1).max(100) });

export const logoutSchema = z.object({ all: z.enum(["true", "false"]).optional() });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

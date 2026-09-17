import { createHash } from "node:crypto";

// B6-08, decided: the rule lives in TWO places, not three — the database
// (profiles_username_shape + profiles_username_lower_key, the guarantee) and
// this file (validation, plus the suffix resolution a CHECK cannot do).
//
// src/utils/username.ts is the third copy and is deliberately kept for now:
// deleting it today would cost the sign-up form its instant feedback while the
// frontend still talks to Supabase. B8 removes it, once the form calls
// GET /auth/username-available instead.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

const USERNAME_SHAPE = /^[a-z0-9][a-z0-9_]{2,29}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return USERNAME_SHAPE.test(value);
}

export function validateUsername(value: string): string | undefined {
  const username = normalizeUsername(value);

  if (!username) return "Username is required.";

  if (username.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return `Username must be at most ${USERNAME_MAX_LENGTH} characters.`;
  }

  if (!/^[a-z0-9]/.test(username)) {
    return "Username must start with a letter or a number.";
  }

  if (!USERNAME_SHAPE.test(username)) {
    return "Username can only contain letters, numbers and underscores.";
  }

  return undefined;
}

// Repairs rather than rejects, since this also runs for people who never
// chose a name. `seed` makes the result deterministic so a retried
// registration resolves to the same name instead of a new one each time.
export function usernameBase(wanted: string, seed: string): string {
  let base = normalizeUsername(wanted)
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^[^a-z0-9]+/, "");

  if (base.length < USERNAME_MIN_LENGTH) {
    base = `${base}u${createHash("md5").update(seed || base).digest("hex").slice(0, 8)}`.replace(
      /^[^a-z0-9]+/,
      "",
    );
  }

  return base.slice(0, USERNAME_MAX_LENGTH);
}

export function suffixedUsername(base: string, suffix: number): string {
  const tail = String(suffix);

  return base.slice(0, USERNAME_MAX_LENGTH - tail.length) + tail;
}

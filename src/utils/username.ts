/**
 * What a Veylo username is. Pure — no React, no network.
 *
 * **This file is the client's copy of a rule the database owns.** The real
 * authority is `profiles_username_key`, a unique index on `lower(username)`,
 * plus the `profiles_username_shape` CHECK — see
 * `20260821120000_username_rules.sql`. Everything here exists to stop a submit
 * that cannot succeed and to say why in a sentence, which a 23505 cannot.
 * When the two disagree the database wins, and the UI's job is to report that
 * gracefully rather than to argue.
 *
 * The pattern is deliberately narrow — lowercase letters, digits and
 * underscores — because a username is an identifier people type at each other,
 * not a display name. `profiles.full_name` already exists for the version with
 * capitals and spaces in it.
 */

/** Two characters is what `search_board_invitees` already treats as too short. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/**
 * Lowercase, and that *is* the canonical form.
 *
 * **Stored lowercased rather than stored-as-typed with a case-insensitive
 * index.** Keeping the typed casing would mean every comparison anywhere —
 * policies, RPCs, joins, this file — has to remember to fold case, and the one
 * that forgets is a bug nobody sees until two accounts collide. Folding once,
 * on the way in, makes `username` and `lower(username)` the same string
 * forever. The cost is that `Ada` renders as `ada`, which is what `full_name`
 * is for.
 */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Must start with a letter or digit, then letters, digits or underscores.
 *
 * The leading character is constrained so `___` and `_ada` are not names —
 * they read as decoration rather than identity, and a name that is only
 * punctuation is impossible to say out loud.
 */
const USERNAME_SHAPE = /^[a-z0-9][a-z0-9_]{2,29}$/;

/** The message for the field, or undefined when the name is usable. */
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

  // Reached only when the length and the first character are already fine, so
  // whatever is wrong is a character in the middle.
  if (!USERNAME_SHAPE.test(username)) {
    return "Username can only contain letters, numbers and underscores.";
  }

  return undefined;
}

/** Whether it is worth asking the server about this one at all. */
export function isUsernameShapeValid(value: string): boolean {
  return validateUsername(value) === undefined;
}

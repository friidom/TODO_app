/**
 * Field checks for the auth forms. Pure — no React, no i18n, no network.
 *
 * The point is to stop a submit that cannot succeed, not to be the authority
 * on what an address is. Supabase decides that, and the confirmation mail
 * decides whether it exists.
 */

import { identifierKind } from "./identifier";
import { validateUsername } from "./username";
/** Supabase's own default minimum. Rejecting shorter here saves a round trip. */
export const PASSWORD_MIN_LENGTH = 6;

// Deliberately loose: something, an @, something, a dot, something. Stricter
// patterns reject addresses that are perfectly valid, which is a worse failure
// than letting a typo through to a server that will catch it.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthFieldErrors {
  /** Registration only; the login form never sets it (M10-01). */
  username?: string;
  email?: string;
  password?: string;
  /** Registration and password reset — the second password field (M22). */
  confirmPassword?: string;
}

export function validateEmail(email: string): string | undefined {
  const trimmed = email.trim();

  if (!trimmed) return "Email is required.";
  if (!EMAIL_SHAPE.test(trimmed)) return "Enter a valid email address.";

  return undefined;
}

/**
 * The login field, which takes an address **or** a username (M22).
 *
 * It dispatches on the same `identifierKind` the sign-in call uses, so the form
 * and the request can never disagree about which branch a string is on. Each
 * branch then defers to the existing checker — there is no third notion of
 * validity invented here.
 *
 * The message names both possibilities rather than guessing which the user
 * meant: "Enter a valid email address" is actively unhelpful to someone who was
 * typing a username and mistyped it.
 */
export function validateIdentifier(value: string): string | undefined {
  const trimmed = value.trim();

  if (!trimmed) return "Email or username is required.";

  if (identifierKind(trimmed) === "email") return validateEmail(trimmed);

  // A username typed at the login form is checked for shape only. It is
  // deliberately NOT checked for existence — that answer belongs to the server,
  // and asking here would build the enumeration oracle the RPC avoids.
  return validateUsername(trimmed)
    ? "Enter a valid email address or username."
    : undefined;
}

export function validatePassword(password: string): string | undefined {
  // Not trimmed: leading and trailing spaces are part of a password, and
  // silently dropping them would reject the credentials the user registered
  // with.
  if (!password) return "Password is required.";

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  return undefined;
}

/**
 * Only the fields that failed appear on the result.
 *
 * `username` is optional because the login form has no such field. Passing
 * `undefined` leaves it unchecked rather than reporting it as missing, which is
 * what keeps this one function serving both screens.
 */
export function validateAuthForm(
  email: string,
  password: string,
  username?: string,
): AuthFieldErrors {
  const errors: AuthFieldErrors = {};

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);

  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;

  if (username !== undefined) {
    const usernameError = validateUsername(username);

    if (usernameError) errors.username = usernameError;
  }

  return errors;
}

/**
 * Whether the two password fields agree.
 *
 * Compared untrimmed, for the reason `validatePassword` records: spaces are
 * part of a password. Trimming one side would let "  hunter2" and "hunter2"
 * pass as a match and then store only one of them.
 *
 * An empty confirmation reports "confirm it" rather than "they do not match" —
 * the second is technically true and reads like an accusation about a field
 * that has not been filled in yet.
 */
export function validateConfirmPassword(
  password: string,
  confirmPassword: string,
): string | undefined {
  if (!confirmPassword) return "Confirm your password.";
  if (password !== confirmPassword) return "Passwords do not match.";

  return undefined;
}

export function hasErrors(errors: AuthFieldErrors): boolean {
  return Boolean(
    errors.email ||
    errors.password ||
    errors.username ||
    errors.confirmPassword,
  );
}

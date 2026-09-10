import { identifierKind } from "./identifier";
import { validateUsername } from "./username";

// matches Supabase's own minimum, so a too-short password fails here instead of round-tripping
export const PASSWORD_MIN_LENGTH = 6;

// deliberately loose — a stricter pattern rejects valid addresses, which is worse than letting a typo reach the server
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthFieldErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function validateEmail(email: string): string | undefined {
  const trimmed = email.trim();

  if (!trimmed) return "Email is required.";
  if (!EMAIL_SHAPE.test(trimmed)) return "Enter a valid email address.";

  return undefined;
}

export function validateIdentifier(value: string): string | undefined {
  const trimmed = value.trim();

  if (!trimmed) return "Email or username is required.";

  if (identifierKind(trimmed) === "email") return validateEmail(trimmed);

  // shape check only — existence is the server's call, checking it here would build an enumeration oracle
  return validateUsername(trimmed)
    ? "Enter a valid email address or username."
    : undefined;
}

export function validatePassword(password: string): string | undefined {
  // not trimmed — spaces are part of a password, dropping them would reject valid credentials
  if (!password) return "Password is required.";

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  return undefined;
}

// username undefined means "no such field" (login form), not "missing" — keeps this serving both screens
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

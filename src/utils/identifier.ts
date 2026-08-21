import { normalizeUsername } from "./username";

/**
 * What the login field accepts: an email address, or a username (M22).
 *
 * **One field, not a toggle.** Asking someone to declare *which kind* of
 * identifier they are about to type is asking them to do work the string
 * already answers — and it doubles the states the form can be in. Every product
 * that supports both does it this way.
 *
 * Pure, so the discrimination rule is testable without a network or a form.
 *
 * **The `@` is the whole test, deliberately.** A username cannot contain one:
 * `USERNAME_SHAPE` in `username.ts` permits letters, digits and underscores
 * only, and the database enforces the same pattern in `profiles_username_shape`.
 * So "contains an @" partitions the space exactly, with no ambiguous middle,
 * and it does not need to agree with `EMAIL_SHAPE` about what a valid address
 * is — that check happens afterwards, on the branch that cares.
 */

export type IdentifierKind = "email" | "username";

export function identifierKind(value: string): IdentifierKind {
  return value.includes("@") ? "email" : "username";
}

/**
 * The identifier as it should be sent.
 *
 * An email is trimmed only — case is preserved because the local part of an
 * address is case-sensitive by RFC, and it is Supabase's business to fold it if
 * it wants to. A username is put through **the same `normalizeUsername` the
 * registration form uses**, which is what makes `ADA`, ` Ada ` and `ada` one
 * account rather than three failed sign-ins. Sharing that function rather than
 * re-lowercasing here is the point: if the canonical form ever changes, login
 * and registration cannot disagree about it.
 */
export function normalizeIdentifier(value: string): {
  kind: IdentifierKind;
  value: string;
} {
  const kind = identifierKind(value);

  return {
    kind,
    value: kind === "email" ? value.trim() : normalizeUsername(value),
  };
}

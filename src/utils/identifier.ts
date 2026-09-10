import { normalizeUsername } from "./username";

// One login field that accepts either an email or a username. The @ is the whole test — usernames can't contain one (see username.ts).

export type IdentifierKind = "email" | "username";

export function identifierKind(value: string): IdentifierKind {
  return value.includes("@") ? "email" : "username";
}

export function normalizeIdentifier(value: string): {
  kind: IdentifierKind;
  value: string;
} {
  const kind = identifierKind(value);

  return {
    kind,
    // email: trim only, case is preserved per RFC. username: shares registration's normalizeUsername so they can't disagree.
    value: kind === "email" ? value.trim() : normalizeUsername(value),
  };
}

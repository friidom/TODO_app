import { normalizeUsername } from "./username.js";

export type IdentifierKind = "email" | "username";

export function normalizeIdentifier(value: string): {
  kind: IdentifierKind;
  value: string;
} {
  const kind: IdentifierKind = value.includes("@") ? "email" : "username";

  return {
    // Email case is preserved per RFC — users.email is citext, so the lookup
    // folds it without help.
    value: kind === "email" ? value.trim() : normalizeUsername(value),
    kind,
  };
}

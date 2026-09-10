// no raw db error reaches the screen — accept_invite's messages are written for a log, not for someone not yet a member.
// mapped on `code`, not message text, since the code is what the migration actually commits to.
const MESSAGES: Record<string, string> = {
  "28000": "Please sign in to accept this invitation.",
  P0002: "This invitation link is not valid. It may have been revoked.",
  "22023": "This invitation link has expired. Ask for a new one.",
  "23505": "This invitation has already been used.",
  "42501": "This invitation cannot be accepted.",
};

const FALLBACK =
  "This invitation could not be accepted. Please try again, or ask for a new link.";

// PostgrestError is a plain object with a code, not an Error subclass, so narrow structurally
export function inviteErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { code } = error as { code?: unknown };

    if (typeof code === "string" && code in MESSAGES) return MESSAGES[code];
  }

  // an unmapped code means a bug in the RPC, not a bad invitation — log it before showing the generic message
  console.error("[invite] unmapped acceptance failure:", error);

  return FALLBACK;
}

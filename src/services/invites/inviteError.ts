// no raw API error reaches the screen — the service's messages are written for a
// log, not for someone not yet a member.
// mapped on `code`, not message text, since the code is what the API commits to.
const MESSAGES: Record<string, string> = {
  unauthorized: "Please sign in to accept this invitation.",
  not_found: "This invitation link is not valid. It may have been revoked.",
  bad_request:
    "This invitation link has expired or is no longer valid. Ask for a new one.",
  conflict: "This invitation has already been used.",
  forbidden: "This invitation cannot be accepted.",
};

const FALLBACK =
  "This invitation could not be accepted. Please try again, or ask for a new link.";

// ApiError carries `code`, but a rejected fetch carries none, so narrow
// structurally rather than with instanceof.
export function inviteErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { code } = error as { code?: unknown };

    if (typeof code === "string" && code in MESSAGES) return MESSAGES[code];
  }

  // an unmapped code means the API grew a failure this map has not caught up
  // with — log it before falling back to the generic message
  console.error("[invite] unmapped acceptance failure:", error);

  return FALLBACK;
}

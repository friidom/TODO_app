import i18n from "@/components/i18n";

// no raw API error reaches the screen — the service's messages are written for a
// log, not for someone not yet a member.
// mapped on `code`, not message text, since the code is what the API commits to.
const MESSAGES: Record<string, string> = {
  unauthorized: "invites.errors.unauthorized",
  not_found: "invites.errors.notFound",
  bad_request: "invites.errors.badRequest",
  conflict: "invites.errors.conflict",
  forbidden: "invites.errors.forbidden",
};

// ApiError carries `code`, but a rejected fetch carries none, so narrow
// structurally rather than with instanceof.
export function inviteErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { code } = error as { code?: unknown };

    if (typeof code === "string" && code in MESSAGES) {
      return i18n.t(MESSAGES[code]);
    }
  }

  // an unmapped code means the API grew a failure this map has not caught up
  // with — log it before falling back to the generic message
  console.error("[invite] unmapped acceptance failure:", error);

  return i18n.t("invites.errors.fallback");
}

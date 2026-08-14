/**
 * What an invitee is told when acceptance fails.
 *
 * **No database error reaches the screen.** `accept_invite` raises messages
 * written for a log — "invitation has already been used", "invitation not
 * found" — and PostgrestError carries `details`, `hint` and the function name
 * alongside them. Rendering `error.message` would leak the shape of the
 * backend to someone who, by definition, is not yet a member of anything.
 *
 * The mapping is on `code`, not on the message text, because the code is the
 * part the migration commits to. The messages there can be reworded; these
 * cannot change meaning without the SQLSTATE changing too.
 *
 * The codes come from `20260814092000_accept_invite_rpc.sql`:
 *
 *   28000  no session          — the frontend should have caught this
 *   P0002  unknown token       — also a revoked one: the row is deleted
 *   22023  expired
 *   23505  already redeemed by someone else
 *   42501  refused             — a stored role of 'owner', or a lost grant
 */

const MESSAGES: Record<string, string> = {
  "28000": "Please sign in to accept this invitation.",
  P0002: "This invitation link is not valid. It may have been revoked.",
  "22023": "This invitation link has expired. Ask for a new one.",
  "23505": "This invitation has already been used.",
  "42501": "This invitation cannot be accepted.",
};

const FALLBACK =
  "This invitation could not be accepted. Please try again, or ask for a new link.";

/**
 * Reads the code off whatever Supabase threw.
 *
 * PostgrestError is a plain object with a `code`, not an Error subclass with a
 * typed field, so this narrows structurally rather than with `instanceof` —
 * the same reason `queryClient.ts` reads `message` the way it does.
 */
export function inviteErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { code } = error as { code?: unknown };

    if (typeof code === "string" && code in MESSAGES) return MESSAGES[code];
  }

  // An unmapped code is a bug in the RPC, not a bad invitation, and the user is
  // about to be told something reassuringly generic about it. Log the real one
  // — `accept_invite` shipped raising 42702 on EVERY call, and the only symptom
  // anywhere was this sentence, with the SQLSTATE discarded here.
  console.error("[invite] unmapped acceptance failure:", error);

  return FALLBACK;
}

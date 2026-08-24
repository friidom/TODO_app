import { Loader2 } from "lucide-react";

import type { MyInvite } from "@/services/invites/invitesApi";
import { inviteErrorMessage } from "@/services/invites/inviteError";
import { useAcceptInvite } from "@/services/invites/useAcceptInvite";
import { useDeclineInvite } from "@/services/invites/useDeclineInvite";
import { cn } from "@/utils/cn";

/**
 * Accept or decline, inside the notification row (M23).
 *
 * **The invitation and the notification are two rows about one thing, and this
 * is where they meet.** `notifications.entity_id` holds the invite's id — put
 * there by the trigger in `20260821160000` — and `my_pending_invites` returns
 * the *token*, which is the credential both RPCs actually take. The panel
 * matches them by id and hands the token down here, so nothing has to store a
 * token in the inbox or invent a second way to redeem one.
 *
 * **`invite` being absent is the whole "already handled" state.**
 * `my_pending_invites` returns only invitations that are still pending — not
 * accepted, not expired — so an invitation that has been accepted, declined,
 * revoked by the inviter, or has simply run out of time falls out of that list
 * and no match is found. One absence covers all four cases, which is exactly
 * what the RPCs do at their end too: they refuse indistinguishably rather than
 * saying which. No client-side expiry arithmetic, no second source of truth.
 *
 * The notification row itself stays either way. It records that you were
 * invited, which remains true; what it stops offering is the buttons.
 */
export default function InviteActions({
  invite,
  pending,
  onSettled,
}: {
  /** The still-pending invitation, or null when it is no longer actionable. */
  invite: MyInvite | null;
  /**
   * The pending list is still in flight, so `invite: null` means "not known
   * yet" rather than "not actionable".
   *
   * Without this the row would assert "no longer available" for a beat on every
   * open — the most alarming possible thing to say about an invitation, and
   * wrong every time.
   */
  pending: boolean;
  /** Close the panel and go to the board — accept only. */
  onSettled: (boardId: string) => void;
}) {
  const accept = useAcceptInvite();
  const decline = useDeclineInvite();

  const busy = accept.isPending || decline.isPending;
  const error = accept.error ?? decline.error;

  // Reserve the row's height rather than collapsing it, so the list does not
  // jump when the answer arrives.
  if (pending) {
    return <div className="mt-2 h-7" aria-hidden />;
  }

  if (!invite) {
    return (
      <p className="text-ink-3 text-mini mt-1.5">
        This invitation is no longer available.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            // The row behind this is a button that navigates. Without this the
            // click would both accept and open the board mid-request.
            e.stopPropagation();
            accept.mutate(invite.token, {
              onSuccess: ({ board_id }) => onSettled(board_id),
            });
          }}
          className={cn(
            "bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand rounded-control inline-flex h-7 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {accept.isPending && <Loader2 className="size-3 animate-spin" />}
          Accept
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            decline.mutate(invite.token);
          }}
          // Quiet, not red. Declining an invitation destroys nothing of anyone
          // else's and is entirely reversible by being invited again — giving
          // it the destructive treatment would put it at the same weight as
          // deleting a board.
          className={cn(
            "text-ink-2 hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-brand rounded-control inline-flex h-7 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {decline.isPending && <Loader2 className="size-3 animate-spin" />}
          Decline
        </button>
      </div>

      {error && (
        <p role="alert" className="text-status-red text-mini mt-1.5">
          {/* Mapped, never raw: `inviteErrorMessage` turns the RPC's SQLSTATE
              into a sentence and logs the code. It is the same mapper the
              /invite/:token page uses, so both doorways to one invitation
              explain a failure identically. */}
          {inviteErrorMessage(error)}
        </p>
      )}
    </div>
  );
}

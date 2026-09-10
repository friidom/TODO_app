import { Loader2 } from "lucide-react";

import type { MyInvite } from "@/services/invites/invitesApi";
import { inviteErrorMessage } from "@/services/invites/inviteError";
import { useAcceptInvite } from "@/services/invites/useAcceptInvite";
import { useDeclineInvite } from "@/services/invites/useDeclineInvite";
import { cn } from "@/utils/cn";

// invite absent covers every "no longer actionable" case at once (accepted, declined, revoked, expired) —
// my_pending_invites just won't return it, no client-side expiry math needed.
export default function InviteActions({
  invite,
  pending,
  onSettled,
}: {
  invite: MyInvite | null;
  // still loading — invite: null here means "not known yet", not "gone"
  pending: boolean;
  onSettled: (boardId: string) => void;
}) {
  const accept = useAcceptInvite();
  const decline = useDeclineInvite();

  const busy = accept.isPending || decline.isPending;
  const error = accept.error ?? decline.error;

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
            // the row itself is a button that navigates
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
          // quiet, not red — declining is reversible, not destructive
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
          {inviteErrorMessage(error)}
        </p>
      )}
    </div>
  );
}

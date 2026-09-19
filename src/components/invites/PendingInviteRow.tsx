import { useState } from "react";
import { roleLabel, roleStyle } from "@/components/members/roleStyles";
import { expiresLabel } from "@/services/invites/inviteLink";
import { useRevokeInvite } from "@/services/invites/useRevokeInvite";
import type { BoardInvite } from "@/services/invites/invitesApi";
import { cn } from "@/utils/cn";

export default function PendingInviteRow({ invite }: { invite: BoardInvite }) {
  const [confirming, setConfirming] = useState(false);

  const revoke = useRevokeInvite();

  return (
    <li className="border-hairline flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
      <span
        className={cn(
          "text-micro shrink-0 rounded px-1.5 py-0.5 font-semibold tracking-wide uppercase",
          roleStyle(invite.role),
        )}
      >
        {roleLabel(invite.role)}
      </span>

      <span className="text-ink-2 min-w-0 flex-1 truncate text-xs">
        {expiresLabel(invite.expires_at)}
      </span>

      {revoke.error ? (
        <span className="text-status-red shrink-0 text-xs">
          Could not revoke
        </span>
      ) : confirming ? (
        <span className="flex shrink-0 items-center gap-2 text-xs">
          <span className="text-ink-2">Revoke?</span>

          <button
            type="button"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(invite.id)}
            className="text-status-red font-medium hover:underline disabled:opacity-50"
          >
            {revoke.isPending ? "Revoking..." : "Yes"}
          </button>

          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-ink-2 hover:text-ink"
          >
            No
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-ink-2 hover:text-status-red text-xs font-medium"
          >
            Revoke
          </button>
        </span>
      )}
    </li>
  );
}

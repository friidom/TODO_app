import { useState } from "react";
import { CopyIcon } from "lucide-react";

import { copyInviteLink } from "./copyInviteLink";
import { roleLabel, roleStyle } from "@/components/members/roleStyles";
import { expiresLabel } from "@/services/invites/inviteLink";
import { useRevokeInvite } from "@/services/invites/useRevokeInvite";
import type { BoardInvite } from "@/services/invites/invitesApi";
import { cn } from "@/utils/cn";

/**
 * One pending invitation: role, how long it has left, copy, revoke.
 *
 * Revoke asks first, inline. **Not `window.confirm`** — a native dialog blocks
 * the browser's event loop, and revoking is destructive in a way that is not
 * undoable: the row is deleted, so the link cannot be brought back and a new
 * one has a different token.
 *
 * The confirm state is per-row and local. Lifting it would let two rows think
 * they are the one being confirmed, and there is nothing else that needs to
 * know.
 */
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
        // Inline rather than a toast: the failure belongs to this row, and the
        // mutation is `meta: { silent: true }` so nothing else reports it.
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
            onClick={() => void copyInviteLink(invite.token)}
            aria-label="Copy invite link"
            className="text-ink-2 hover:text-ink hover:bg-ink/10 rounded p-1"
          >
            <CopyIcon className="size-3.5" />
          </button>

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

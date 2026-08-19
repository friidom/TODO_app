import { useNavigate } from "react-router";
import { MailOpen } from "lucide-react";

import { useMyInvites } from "@/services/invites/useMyInvites";
import { useAcceptInvite } from "@/services/invites/useAcceptInvite";

/**
 * Boards you have been invited to but have not joined (M4-08 stage 1).
 *
 * **This exists because stage 1 sends no email.** An addressed invitation is
 * visible to the board's admins the moment it is created and to nobody else,
 * so without a surface here the one person it concerns would never learn of
 * it. Stage 2 adds a message in their inbox; this list does not go away when
 * it does — the mail becomes a second doorway to the same rows.
 *
 * It renders nothing at all when there is nothing pending, which is the common
 * case. A permanently visible empty "Invitations" heading would cost every user
 * a slot in the sidebar to tell them about something that has not happened.
 *
 * Accepting reuses `accept_invite` and the token from the row, so this is the
 * same redemption path a link takes — no second way to join a board.
 */
export default function MyInvitations() {
  const { data: invites = [] } = useMyInvites();
  const acceptInvite = useAcceptInvite();
  const navigate = useNavigate();

  if (!invites.length) return null;

  return (
    <div className="px-3 py-2">
      <p className="text-ink-3 mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
        <MailOpen size={12} />
        Invitations
      </p>

      <ul className="flex flex-col gap-1">
        {invites.map((invite) => (
          <li
            key={invite.id}
            className="border-brand/30 bg-brand-soft/30 rounded-lg border px-2.5 py-2"
          >
            <p className="text-ink truncate text-[13px] font-medium">
              {invite.board_title}
            </p>

            <p className="text-ink-3 mb-1.5 text-[11px] capitalize">
              as {invite.role}
            </p>

            <button
              type="button"
              disabled={acceptInvite.isPending}
              onClick={() =>
                acceptInvite.mutate(invite.token, {
                  // Straight to the board that was just joined — the whole
                  // point of accepting is to end up there.
                  onSuccess: ({ board_id }) => navigate(`/boards/${board_id}`),
                })
              }
              className="bg-brand text-brand-fg hover:bg-brand/90 w-full rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-50"
            >
              {acceptInvite.isPending ? "Joining…" : "Accept"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { useState } from "react";
import { LinkIcon, MailIcon } from "lucide-react";

import { roleLabel, roleStyle } from "@/components/members/roleStyles";
import { expiresLabel, expiryDate } from "@/services/invites/inviteLink";
import { useRevokeInvite } from "@/services/invites/useRevokeInvite";
import type { BoardInvite } from "@/services/invites/invitesApi";
import { cn } from "@/utils/cn";

const TEXT_BUTTON =
  "focus-visible:ring-brand rounded px-1.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 disabled:opacity-50";

export default function PendingInviteRow({
  invite,
  inviter,
  note = null,
  canRevoke,
}: {
  invite: Pick<BoardInvite, "id" | "email" | "role" | "expires_at">;
  inviter: string | null;
  // what a space invitation covers, shown before who sent it
  note?: string | null;
  canRevoke: boolean;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  const revoke = useRevokeInvite();
  const Icon = invite.email ? MailIcon : LinkIcon;
  const who = invite.email ?? t("invites.shareableLink");

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="bg-ink/[0.05] text-ink-2 grid size-7 shrink-0 place-items-center rounded-full">
        <Icon className="size-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-ink truncate text-sm">{who}</span>

          <span
            className={cn(
              "text-micro shrink-0 rounded px-1.5 py-0.5 font-semibold tracking-wide uppercase",
              roleStyle(invite.role),
            )}
          >
            {roleLabel(invite.role)}
          </span>
        </span>

        <span
          title={expiryDate(invite.expires_at)}
          className="text-ink-3 block truncate text-xs"
        >
          {[
            note,
            inviter
              ? t("invites.byAndExpiry", {
                  name: inviter,
                  when: expiresLabel(invite.expires_at),
                })
              : expiresLabel(invite.expires_at),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>

      {!canRevoke ? null : revoke.error ? (
        <span role="alert" className="text-status-red shrink-0 text-xs">
          {t("invites.revokeFailed")}
        </span>
      ) : confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-ink-2 text-xs">
            {t("invites.revokeQuestion")}
          </span>

          <button
            type="button"
            autoFocus
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(invite.id)}
            className={cn(
              TEXT_BUTTON,
              "text-status-red hover:bg-status-red/10",
            )}
          >
            {revoke.isPending ? t("invites.revoking") : t("invites.revoke")}
          </button>

          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={cn(
              TEXT_BUTTON,
              "text-ink-2 hover:bg-ink/5 hover:text-ink",
            )}
          >
            {t("common.cancel")}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={t("invites.revokeFor", { name: who })}
          className={cn(
            TEXT_BUTTON,
            "text-ink-2 hover:bg-status-red/10 hover:text-status-red shrink-0",
          )}
        >
          {t("invites.revoke")}
        </button>
      )}
    </li>
  );
}

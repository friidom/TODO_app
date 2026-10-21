import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  ClockIcon,
  Loader2,
  MailOpenIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router";

import Loading from "@/components/loading/LoadingPage";
import { roleLabel } from "@/components/members/roleStyles";
import { useAuth } from "@/services/auth/useAuth";
import type { InvitePreview } from "@/services/invites/invitesApi";
import { inviteErrorMessage } from "@/services/invites/inviteError";
import { expiresLabel, expiryDate } from "@/services/invites/inviteLink";
import { useAcceptInvite } from "@/services/invites/useAcceptInvite";
import { useInvitePreview } from "@/services/invites/useInvitePreview";
import { toast } from "@/stores/toasts";
import { cn } from "@/utils/cn";

const BUTTON =
  "focus-visible:ring-brand flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-50";
const PRIMARY = cn(BUTTON, "bg-brand text-brand-fg hover:bg-brand/90");
const QUIET = cn(BUTTON, "text-ink-2 hover:bg-ink/5 hover:text-ink");

const ROLE_HINTS: Record<string, string> = {
  viewer: "invites.roleViewer",
  editor: "invites.roleEditor",
  admin: "invites.roleAdmin",
};

// routed outside both auth guards, since it needs to work whether the visitor is signed in or not
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();

  if (loading) return <Loading />;

  if (!token) return <Navigate to="/" replace />;

  if (!user) {
    const next = encodeURIComponent(`/invite/${token}`);

    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <AcceptInvite token={token} />;
}

function AcceptInvite({ token }: { token: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite();

  const home = (
    <button type="button" onClick={() => navigate("/")} className={QUIET}>
      {t("invites.goHome")}
    </button>
  );

  if (preview.isPending) {
    return (
      <InviteCard icon={<Loader2 className="text-brand size-7 animate-spin" />}>
        <p role="status" className="text-ink-2 text-sm">
          {t("invites.checking")}
        </p>
      </InviteCard>
    );
  }

  if (preview.isError) {
    return (
      <InviteCard
        tone="danger"
        icon={<TriangleAlertIcon className="text-status-red size-7" />}
        title={t("invites.unavailableTitle")}
        body={inviteErrorMessage(preview.error)}
      >
        {home}
      </InviteCard>
    );
  }

  const invite = preview.data;
  const forSpace = invite.kind === "space";
  const first = invite.boards[0]!;
  const board = first.title || t("common.untitledBoard");
  const name = forSpace ? (invite.space_title ?? board) : board;
  const open = (boardId: string) =>
    navigate(`/boards/${boardId}`, { replace: true });

  if (invite.status === "member" || accept.data?.status === "already_member") {
    return (
      <InviteCard
        icon={<UsersIcon className="text-brand size-7" />}
        title={t("invites.alreadyMember")}
        body={
          forSpace
            ? t("invites.alreadyOnEveryBoard", { space: name })
            : t("invites.alreadyMemberOf", { board })
        }
      >
        <button
          type="button"
          onClick={() => open(first.id)}
          className={PRIMARY}
        >
          {t("invites.openBoard")}
        </button>
      </InviteCard>
    );
  }

  if (invite.status === "expired") {
    const date = expiryDate(invite.expires_at);

    return (
      <InviteCard
        tone="muted"
        icon={<ClockIcon className="text-ink-3 size-7" />}
        title={t("invites.expiredTitle")}
        body={
          invite.inviter_name
            ? t("invites.expiredBody", { date, name: invite.inviter_name })
            : t("invites.expiredBodyAnon", { date })
        }
      >
        <InviteSummary invite={invite} />
        {home}
      </InviteCard>
    );
  }

  function handleAccept() {
    accept.mutate(
      { token },
      {
        onSuccess: ({ status, board_id, board_ids }) => {
          if (status === "accepted") {
            toast.success(
              forSpace
                ? t("invites.joinedBoards", {
                    count: board_ids.length,
                    space: name,
                  })
                : t("invites.joinedBoard", { board }),
            );
            open(board_id);
          }
        },
      },
    );
  }

  return (
    <InviteCard
      icon={<MailOpenIcon className="text-brand size-7" />}
      title={t("invites.joinTitle", { board: name })}
      body={
        invite.inviter_name
          ? t("invites.invitedBy", { name: invite.inviter_name })
          : t("invites.invitedAnon")
      }
    >
      <InviteSummary invite={invite} />

      {accept.error && (
        <p
          role="alert"
          className="bg-status-red/15 text-status-red mb-3 rounded-lg px-4 py-3 text-sm"
        >
          {inviteErrorMessage(accept.error)}
        </p>
      )}

      <button
        type="button"
        autoFocus
        onClick={handleAccept}
        disabled={accept.isPending}
        className={cn(PRIMARY, "mb-2")}
      >
        {accept.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CheckIcon className="size-4" />
        )}
        {accept.isPending ? t("invites.accepting") : t("invites.accept")}
      </button>

      <button type="button" onClick={() => navigate("/")} className={QUIET}>
        {t("invites.notNow")}
      </button>
    </InviteCard>
  );
}

function InviteSummary({ invite }: { invite: InvitePreview }) {
  const { t } = useTranslation();
  const hint = ROLE_HINTS[invite.role];
  const forSpace = invite.kind === "space";

  return (
    <dl className="border-hairline divide-hairline mb-6 divide-y rounded-lg border text-sm">
      {invite.space_title && (
        <Row label={t("invites.detailSpace")}>{invite.space_title}</Row>
      )}

      <Row label={t(forSpace ? "invites.detailBoards" : "invites.detailBoard")}>
        <ul className="flex flex-col gap-1">
          {invite.boards.map((board) => (
            <li key={board.id} className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-medium">
                {board.title || t("common.untitledBoard")}
              </span>
              <span className="text-ink-3 shrink-0 text-xs">{board.key}</span>
              {board.member && (
                <span className="text-ink-3 shrink-0 text-xs">
                  {t("invites.alreadyOnIt")}
                </span>
              )}
            </li>
          ))}
        </ul>

        {forSpace && (
          <span className="text-ink-3 mt-1.5 block text-xs">
            {t("invites.laterBoardsRecipient")}
          </span>
        )}
      </Row>

      <Row label={t("invites.detailRole")}>
        <span className="font-medium">{roleLabel(invite.role)}</span>
        {hint && <span className="text-ink-3 block text-xs">{t(hint)}</span>}
      </Row>

      {invite.status === "pending" && (
        <Row label={t("invites.detailExpires")}>
          {expiryDate(invite.expires_at)}
          <span className="text-ink-3 block text-xs">
            {expiresLabel(invite.expires_at)}
          </span>
        </Row>
      )}
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 px-3.5 py-2.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink min-w-0">{children}</dd>
    </div>
  );
}

const TONE = {
  brand: "bg-brand-soft",
  muted: "bg-ink/5",
  danger: "bg-status-red/10",
};

function InviteCard({
  icon,
  title,
  body,
  tone = "brand",
  children,
}: {
  icon: ReactNode;
  title?: string;
  body?: string;
  tone?: keyof typeof TONE;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="border-hairline bg-surface rounded-surface shadow-e3 w-full max-w-[440px] border p-6 sm:p-8">
        <span
          className={cn(
            "rounded-surface mb-5 grid size-14 place-items-center",
            TONE[tone],
          )}
        >
          {icon}
        </span>

        {title && <h1 className="text-ink mb-2 text-xl font-bold">{title}</h1>}

        {body && (
          <p className="text-ink-2 mb-5 text-sm leading-relaxed">{body}</p>
        )}

        {children}
      </div>
    </div>
  );
}

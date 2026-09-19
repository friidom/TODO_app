import { CheckIcon, MailOpenIcon, UsersIcon } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router";

import Loading from "@/components/loading/LoadingPage";
import { useAuth } from "@/services/auth/useAuth";
import { inviteErrorMessage } from "@/services/invites/inviteError";
import { useAcceptInvite } from "@/services/invites/useAcceptInvite";
import { toast } from "@/stores/toasts";

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
  const navigate = useNavigate();
  const accept = useAcceptInvite();

  function handleAccept() {
    accept.mutate({ token }, {
      onSuccess: ({ status, board_id }) => {
        if (status === "accepted") {
          toast.success("You've joined the board");
          navigate(`/boards/${board_id}`, { replace: true });
        }
      },
    });
  }

  const result = accept.data;

  if (result?.status === "already_member") {
    return (
      <InviteCard
        icon={<UsersIcon className="text-brand size-7" />}
        title="You're already a member"
        body="This invitation is for a board you already have access to. Your role has not changed."
      >
        <button
          type="button"
          onClick={() => navigate(`/boards/${result.board_id}`)}
          className="bg-brand text-brand-fg hover:bg-brand/90 w-full rounded-lg px-4 py-2.5 text-sm font-medium"
        >
          Open board
        </button>
      </InviteCard>
    );
  }

  return (
    <InviteCard
      icon={<MailOpenIcon className="text-brand size-7" />}
      title="You've been invited to a board"
      body="Accept to join. The role you get was chosen by whoever sent the link."
    >
      {accept.error && (
        <p className="bg-status-red/15 text-status-red mb-3 rounded-lg px-4 py-3 text-sm">
          {inviteErrorMessage(accept.error)}
        </p>
      )}

      <button
        type="button"
        onClick={handleAccept}
        disabled={accept.isPending}
        className="bg-brand text-brand-fg hover:bg-brand/90 mb-2 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
      >
        {accept.isPending ? (
          "Accepting..."
        ) : (
          <>
            <CheckIcon className="size-4" />
            Accept invitation
          </>
        )}
      </button>

      <button
        type="button"
        onClick={() => navigate("/")}
        className="text-ink-2 hover:text-ink w-full rounded-lg px-4 py-2 text-sm"
      >
        Not now
      </button>
    </InviteCard>
  );
}

function InviteCard({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="border-hairline bg-surface rounded-surface w-full max-w-[420px] border p-6 shadow-e3 sm:p-8">
        <span className="bg-brand-soft rounded-surface mb-5 grid size-14 place-items-center">
          {icon}
        </span>

        <h1 className="text-ink mb-2 text-xl font-bold">{title}</h1>

        <p className="text-ink-2 mb-6 text-sm leading-relaxed">{body}</p>

        {children}
      </div>
    </div>
  );
}

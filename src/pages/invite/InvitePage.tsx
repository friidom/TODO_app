import { CheckIcon, MailOpenIcon, UsersIcon } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router";

import Loading from "@/components/loading/LoadingPage";
import { useAuth } from "@/services/auth/useAuth";
import { inviteErrorMessage } from "@/services/invites/inviteError";
import { useAcceptInvite } from "@/services/invites/useAcceptInvite";
import { toast } from "@/stores/toasts";

/**
 * `/invite/:token` — where an invite link is redeemed.
 *
 * **Routed outside both guards**, unlike every other page. `ProtectedRoute`
 * would bounce a signed-out visitor to `/login` and lose the token on the way;
 * `PublicRoute` would bounce a signed-in one to `/`. This page is the only one
 * that has to work in both states, so it does its own gating.
 *
 * The signed-out path is `?next=`: the visitor goes to login, the token rides
 * along in the query string, and `useLogin` / `useRegister` / `PublicRoute`
 * each send them back here afterwards. Register matters more than login —
 * someone being invited to a board usually does not have an account yet.
 *
 * Nothing about the board is shown before acceptance, and that is deliberate
 * rather than an omission: `board_invites` is readable only by the board's
 * owners and admins, so there is no query a token holder could run to learn
 * the board's name. Adding a preview RPC would mean a way to probe a token
 * without spending it, for the sake of one line of copy.
 */
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();

  if (loading) return <Loading />;

  // A route with no token cannot match, but the param is typed as optional.
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
    accept.mutate(token, {
      onSuccess: ({ status, board_id }) => {
        // 'already_member' stays on this page and says so — navigating
        // straight to the board would look identical to a successful join and
        // leave the person wondering whether the link did anything.
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
        // Mapped, never raw: this reader is not a member of anything yet, and
        // a Postgres message would describe the backend to a stranger.
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

/** The one card shape all three states share, so they are one page. */
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
      <div className="bg-card w-[420px] rounded-2xl p-8 shadow-2xl">
        <span className="bg-brand-soft mb-5 grid size-14 place-items-center rounded-2xl">
          {icon}
        </span>

        <h1 className="text-ink mb-2 text-xl font-bold">{title}</h1>

        <p className="text-ink-2 mb-6 text-sm leading-relaxed">{body}</p>

        {children}
      </div>
    </div>
  );
}

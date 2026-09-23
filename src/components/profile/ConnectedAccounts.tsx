import { CheckIcon, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router";

import { useLinkProvider, useOAuthConnections, useOAuthProviders, useUnlinkProvider } from "@/services/auth/useOAuth";
import type { OAuthConnection, OAuthProvider } from "@/services/auth/oauthApi";
import { oauthErrorMessage } from "@/services/auth/oauthErrors";

const LABELS: Record<string, string> = { google: "Google", github: "GitHub" };

function labelOf(provider: string): string {
  return LABELS[provider] ?? provider;
}

const ACTION =
  "border-hairline text-ink-2 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control text-meta flex h-9 items-center gap-2 border px-3 font-medium transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

const DANGER =
  "border-status-red/30 text-status-red hover:bg-status-red/10 focus-visible:ring-status-red rounded-control text-meta flex h-9 items-center gap-2 border px-3 font-medium transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

export default function ConnectedAccounts() {
  const [searchParams] = useSearchParams();
  const { data, isLoading } = useOAuthConnections();
  const { data: providers } = useOAuthProviders();
  const link = useLinkProvider();
  const unlink = useUnlinkProvider();

  if (isLoading || data === undefined) {
    return <p className="text-ink-3 text-sm">Loading…</p>;
  }

  const { connections, hasPassword } = data;

  // The same rule the server enforces in unlinkConnection, mirrored so the
  // button can explain itself instead of the person discovering the 409 by
  // clicking it. The server check is still the real one.
  const isLastWayIn = (count: number) => !hasPassword && count <= 1;

  const available = (providers ?? []).filter(
    (provider) => !connections.some((c) => c.provider === provider),
  );

  // Set by the OAuth callback when it returns from a link started here, and by
  // OAuthLinkCompleter after it spends a challenge.
  const justLinked = searchParams.get("linked") === "1";

  // A link started here that failed is redirected back to /profile, not
  // /login -- PublicRoute would bounce an authenticated visitor away from the
  // latter before the message could be read.
  const linkError = oauthErrorMessage(searchParams.get("error"));

  return (
    <div className="flex flex-col gap-4">
      {justLinked && (
        <p className="border-status-green/30 bg-status-green/10 text-status-green rounded-control flex items-center gap-2 border px-3 py-2 text-xs">
          <CheckIcon className="size-4 shrink-0" />
          Sign-in method connected.
        </p>
      )}

      {linkError !== null && (
        <p
          role="alert"
          className="border-status-red/30 bg-status-red/10 text-status-red rounded-control border px-3 py-2 text-xs"
        >
          {linkError}
        </p>
      )}

      {connections.length === 0 && (
        <p className="text-ink-3 text-sm">
          No sign-in methods connected yet. Connecting one lets you sign in without a password.
        </p>
      )}

      {connections.map((connection: OAuthConnection) => {
        const blocked = isLastWayIn(connections.length);

        return (
          <div key={connection.id} className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-ink text-sm font-medium">{labelOf(connection.provider)}</p>
              <p className="text-ink-3 truncate text-xs">
                {connection.email ?? "Connected"}
              </p>
            </div>

            <button
              type="button"
              disabled={blocked || unlink.isPending}
              title={
                blocked
                  ? "This is the only way into your account. Set a password first, or connect another provider."
                  : undefined
              }
              onClick={() => unlink.mutate(connection.id)}
              className={DANGER}
            >
              {unlink.isPending && <Loader2 className="size-4 animate-spin" />}
              Disconnect
            </button>
          </div>
        );
      })}

      {unlink.isError && (
        <p role="alert" className="text-status-red text-xs">
          {unlink.error.message}
        </p>
      )}

      {available.map((provider: OAuthProvider) => (
        <div key={provider} className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-ink text-sm font-medium">{labelOf(provider)}</p>
            <p className="text-ink-3 text-xs">Not connected</p>
          </div>

          <button
            type="button"
            disabled={link.isPending}
            onClick={() => link.mutate(provider)}
            className={ACTION}
          >
            {link.isPending && <Loader2 className="size-4 animate-spin" />}
            Connect
          </button>
        </div>
      ))}

      {link.isError && (
        <p role="alert" className="text-status-red text-xs">
          {link.error.message}
        </p>
      )}
    </div>
  );
}

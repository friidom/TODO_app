import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "@/services/auth/useAuth";
import { clearPendingLink, readPendingLink } from "@/services/auth/pendingLink";
import { useConfirmLink } from "@/services/auth/useOAuth";

// Mounted inside the authenticated tree, not on the login page: signing in IS
// the proof of ownership the challenge asks for, and by the time a session
// exists the login page has already navigated away.
//
// A failure is deliberately silent: the identity simply stays unlinked, and
// Connected accounts is where the person retries.
export default function OAuthLinkCompleter() {
  const { user } = useAuth();
  const confirm = useConfirmLink();
  const navigate = useNavigate();

  const spent = useRef(false);

  useEffect(() => {
    if (user === null || spent.current) return;

    const token = readPendingLink();

    if (token === null) return;

    spent.current = true;

    // Cleared before the request, not after: the token is single use, so a
    // retry could only ever fail, and leaving it would retry on every mount.
    clearPendingLink();

    confirm.mutate(token, {
      onSuccess: () => navigate("/profile?linked=1", { replace: true }),
    });
  }, [user, confirm, navigate]);

  return null;
}

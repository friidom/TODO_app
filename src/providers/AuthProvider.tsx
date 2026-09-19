import { useEffect, useMemo, useState } from "react";

import { refreshSession, setSessionEndedHandler } from "../services/api/client";
import { fetchMe } from "../services/auth/authApi";
import {
  getSessionUser,
  setSessionUser,
  subscribeToSession,
  type AuthUser,
} from "../services/auth/session";
// module singleton, not useQueryClient() — this provider mounts above QueryClientProvider
import { queryClient } from "../services/queryClient/queryClient";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getSessionUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = subscribeToSession((next) => {
      if (!mounted) return;

      // Covers every way a session can end — the logout button, a dead refresh
      // token, a sign-out in another tab — because two users can share one
      // browser and a board id outlives a session.
      if (next === null) queryClient.clear();

      setUser(next);
    });

    // The access token lives in memory only, so a reload always starts by
    // spending the refresh cookie. A failure here is "not signed in", not an
    // error worth surfacing.
    async function restore() {
      const restored = (await refreshSession()) ? await fetchMe().catch(() => null) : null;

      if (!mounted) return;

      setSessionUser(restored);
      setLoading(false);
    }

    setSessionEndedHandler(() => setSessionUser(null));

    restore();

    return () => {
      mounted = false;
      unsubscribe();
      setSessionEndedHandler(() => {});
    };
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

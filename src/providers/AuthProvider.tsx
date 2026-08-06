import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../services/api/supabase";
// The module singleton, not useQueryClient(): this provider is mounted above
// QueryClientProvider, so there is no client in context to read.
import { queryClient } from "../services/queryClient/queryClient";
import { AuthContext } from "./authContext";

// The single owner of auth state: one getSession() and one onAuthStateChange
// subscription per page load, however many call sites useAuth() has.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setUser(session?.user ?? null);
      setLoading(false);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // Every sign-out, not just the logout button: token expiry and a
      // sign-out in another tab arrive here too. Keys are board-scoped now, so
      // this is no longer about one global ["todos"] entry — but two users of
      // the same browser can still be shown the same board id, and a cached
      // entry under it would be the previous user's rows.
      if (event === "SIGNED_OUT") {
        queryClient.clear();
      }

      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

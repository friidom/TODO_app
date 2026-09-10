import { createContext } from "react";
import type { User } from "@supabase/supabase-js";

// split out so AuthProvider.tsx only exports a component — react-refresh can't fast-refresh a mixed module
export type AuthState = {
  user: User | null;
  loading: boolean;
};

// no default value — a plausible one like { user: null, loading: false } would hide a missing provider instead of throwing
export const AuthContext = createContext<AuthState | undefined>(undefined);

import { createContext } from "react";
import type { User } from "@supabase/supabase-js";

// Split out of AuthProvider.tsx so that file only exports its component:
// react-refresh cannot fast-refresh a module that mixes components with other
// exports.

export type AuthState = {
  user: User | null;
  loading: boolean;
};

// No default value: a `useAuth()` outside the provider is a mounting bug, and a
// plausible-looking default ({ user: null, loading: false }) would hide it by
// bouncing the user to /login instead.
export const AuthContext = createContext<AuthState | undefined>(undefined);

import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { requestPasswordReset, signOut, updatePassword } from "./authApi";

/**
 * The two halves of a password reset (M22).
 *
 * Both are `meta: { silent: true }`, matching `useLogin` and `useRegister`: the
 * pages render their own failure next to the field that caused it, and the
 * global `MutationCache` toast would say the same thing a second time in a
 * different corner of the screen.
 *
 * Neither hook touches the session. A recovery link has already signed the user
 * in by the time the reset page renders — that is how `updateUser` is allowed
 * to work — and `AuthProvider`'s `onAuthStateChange` subscription picks the new
 * state up on its own, exactly as it does for every other auth event.
 */

/** Ask Supabase to send the link. Resolves the same for any address. */
export function useRequestPasswordReset() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (email: string) => requestPasswordReset(email),
  });
}

/**
 * Set the new password, end the recovery session, then ask them to sign in.
 *
 * **The sign-out is the security decision, not tidiness.** A recovery link
 * mints a real session, so leaving it live means a leaked or forwarded reset
 * email is a full account takeover rather than a password change. Ending it the
 * moment the password is set reduces the link's power to exactly what it was
 * for, and it invalidates the link for anyone else who has a copy.
 *
 * It is also what makes `/login` reachable at all: `PublicRoute` redirects a
 * signed-in visitor away, so navigating there while still holding the recovery
 * session would bounce straight to `/`.
 *
 * `signOut` is the same function the sidebar's logout uses — no second path out
 * of a session — and `AuthProvider`'s subscription clears the query cache on
 * `SIGNED_OUT` however it happened.
 */
export function useUpdatePassword() {
  const navigate = useNavigate();

  return useMutation({
    meta: { silent: true },
    mutationFn: async (password: string) => {
      await updatePassword(password);
      await signOut();
    },
    onSuccess: () => navigate("/login?reset=1", { replace: true }),
  });
}

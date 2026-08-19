import { supabase } from "../api/supabase";

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;

  // **Provisioning does not happen here any more, and cannot.** Email
  // confirmation is required as of 2026-08-19, so Supabase returns a user with
  // no session and `auth.uid()` is null — `provision_new_user` would raise
  // "requires an authenticated session", exactly as this function's previous
  // comment predicted it would. The board is seeded by the
  // `on_auth_user_confirmed` trigger instead.
  //
  // The call is kept for the one case that still has a session: a project with
  // confirmations turned back off, where signUp returns one immediately. That
  // makes this file correct under either setting rather than silently wrong
  // under one of them.
  if (data.session) {
    const { error: provisionError } = await supabase.rpc("provision_new_user");

    if (provisionError) throw provisionError;
  }

  return {
    ...data,
    /**
     * No session means the address has to be confirmed before there is one.
     * Read off the response rather than assumed from configuration, so the UI
     * tells the truth whichever way the project is set.
     */
    needsConfirmation: !data.session,
  };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  // The repair path, and the reason the trigger is allowed to swallow its
  // errors. Provisioning normally happens at confirmation; if it failed there,
  // this fixes it on the next sign-in. Idempotent and one indexed lookup when
  // there is nothing to do, which is every sign-in after the first.
  //
  // Not fatal: a user who cannot be provisioned should still get into the app
  // and see the empty-board state, rather than being unable to sign in at all.
  const { error: provisionError } = await supabase.rpc("provision_new_user");

  if (provisionError) {
    console.warn("provision_new_user failed on sign-in", provisionError);
  }

  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) throw error;
}

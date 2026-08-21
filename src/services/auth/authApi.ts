import { supabase } from "../api/supabase";
import { normalizeIdentifier } from "@/utils/identifier";
import { normalizeUsername } from "@/utils/username";

export async function signUp(
  email: string,
  password: string,
  username: string,
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      /**
       * **The only channel a username can travel at signup** (M10-01).
       *
       * Confirmation is required, so there is no session here and `auth.uid()`
       * is null — the client cannot write to `profiles` at all. Metadata rides
       * on `auth.users.raw_user_meta_data`, survives the confirmation gap, and
       * is read back by `provision_user()` at the moment the profile is
       * actually created. No second table, nothing pending to reconcile.
       *
       * Normalised here as well as in Postgres so what is stored on the auth
       * user matches what ends up on the profile.
       */
      data: { username: normalizeUsername(username) },
    },
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

/**
 * The message a failed sign-in gives, whatever actually failed.
 *
 * GoTrue's own wording for a wrong password, reused verbatim for "no such
 * username" — because the two must be indistinguishable. A distinct "unknown
 * username" would turn the login form into an account-existence oracle that is
 * cheaper to walk than the RPC behind it.
 */
const INVALID_CREDENTIALS = "Invalid login credentials";

/**
 * Sign in with an email address **or** a username (M22).
 *
 * **The email path is untouched.** An identifier containing an `@` goes
 * straight to `signInWithPassword` exactly as it always did — no RPC, no extra
 * round trip, no new failure mode on the path every existing user takes.
 *
 * A username is resolved first through `login_email_for`, a SECURITY DEFINER
 * function that returns one column and nothing else. `profiles` RLS is
 * self-only, so a signed-out client genuinely cannot read that row itself; the
 * function is the narrow question, not a way around the policy. See
 * `20260821150000_login_email_for.sql` for what it discloses and why that was
 * accepted.
 *
 * **Normalisation is `normalizeIdentifier`, which calls the same
 * `normalizeUsername` the registration form uses.** That shared call is what
 * makes `ADA`, ` Ada ` and `ada` one account rather than three failed sign-ins,
 * and it is why the canonical form can change in one place.
 */
export async function signIn(identifier: string, password: string) {
  const { kind, value } = normalizeIdentifier(identifier);

  let email = value;

  if (kind === "username") {
    const { data: resolved, error: resolveError } = await supabase.rpc(
      "login_email_for",
      { p_username: value },
    );

    // A failure here is the function being absent (the migration has not been
    // applied) or unreachable. Reporting it as bad credentials would send
    // someone to reset a password that is perfectly fine, so it surfaces.
    if (resolveError) throw resolveError;

    // Unknown, malformed and empty all arrive as null, and all three become the
    // same message a wrong password gives.
    if (!resolved) throw new Error(INVALID_CREDENTIALS);

    email = resolved;
  }

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

/**
 * Start a password reset (M22).
 *
 * **`redirectTo` is built from `window.location.origin`**, so the same build
 * works on localhost and on the deployed domain without an environment
 * variable to keep in step. Supabase only honours it if the URL is in the
 * project's redirect allow-list — both origins have to be added there, and a
 * missing entry is why a link silently lands on the site root instead.
 *
 * **It resolves the same way whether or not the address exists.** Supabase
 * already behaves like this; not inspecting the result keeps the caller honest
 * about it, because the one thing this screen must not become is a way to ask
 * "is this person a user here".
 */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) throw error;
}

/**
 * Set a new password for whoever the current session belongs to.
 *
 * Used only by the reset page, and it works there because a recovery link
 * *signs the user in* — Supabase exchanges the token in the URL for a real
 * session before the page renders. That is also why `/reset-password` sits
 * outside both route guards: `PublicRoute` would see the session and redirect
 * away before the form could be used.
 *
 * `updateUser` is the ordinary account-update call, not a reset-specific one.
 * There is no second password system here.
 */
export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });

  if (error) throw error;
}

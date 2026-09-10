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
      // rides in auth metadata since there's no session yet to write profiles directly — provision_user() reads it back at confirmation
      data: { username: normalizeUsername(username) },
    },
  });

  if (error) throw error;

  // only runs if email confirmation is off and signUp already returned a session — otherwise provisioning happens via the on_auth_user_confirmed trigger
  if (data.session) {
    const { error: provisionError } = await supabase.rpc("provision_new_user");

    if (provisionError) throw provisionError;
  }

  return {
    ...data,
    needsConfirmation: !data.session,
  };
}

// reused for "no such username" too — a distinct message would make this an account-existence oracle
const INVALID_CREDENTIALS = "Invalid login credentials";

export async function signIn(identifier: string, password: string) {
  const { kind, value } = normalizeIdentifier(identifier);

  let email = value;

  if (kind === "username") {
    const { data: resolved, error: resolveError } = await supabase.rpc(
      "login_email_for",
      { p_username: value },
    );

    if (resolveError) throw resolveError;
    if (!resolved) throw new Error(INVALID_CREDENTIALS);

    email = resolved;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  // repairs a provisioning that failed at confirmation — not fatal, a user should still get in even if this fails
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

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) throw error;
}

// used only by the reset page — a recovery link signs the user in before this renders, which is also why /reset-password skips PublicRoute
export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });

  if (error) throw error;
}

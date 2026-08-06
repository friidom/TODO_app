import { supabase } from "../api/supabase";

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;

  // One call, one transaction. This used to be a profile upsert followed by a
  // four-column insert, with nothing tying them together: either could fail on
  // its own and leave an account that exists but cannot be used, and nothing
  // repaired it. provision_new_user does both plus the board, and rolls the
  // whole thing back if any part fails.
  //
  // Nothing is passed to it. The user comes from auth.uid() inside the
  // function, so a caller cannot provision for somebody else, and the email is
  // read from auth.users rather than sent from here.
  //
  // Guarded on `data.user` rather than `data.session` deliberately. They are
  // the same thing while email confirmation is off, which it is. If it is ever
  // turned on, signUp returns a user with no session, and this call fails
  // loudly with "requires an authenticated session" instead of silently
  // skipping provisioning and leaving a boardless account behind.
  if (data.user) {
    const { error: provisionError } = await supabase.rpc("provision_new_user");

    if (provisionError) throw provisionError;
  }

  return data;
}
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) throw error;
}

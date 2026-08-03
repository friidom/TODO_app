import { supabase } from "./supabase";

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;

  if (data.user) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      email: data.user.email,
      username: data.user.email?.split("@")[0],
    });

    const { error: columnsError } = await supabase.from("columns").insert([
      {
        title: "To Do",
        position: 0,
        user_id: data.user.id,
      },
      {
        title: "In Progress",
        position: 1,
        user_id: data.user.id,
      },
      {
        title: "In Review",
        position: 2,
        user_id: data.user.id,
      },
      {
        title: "Done",
        position: 3,
        user_id: data.user.id,
      },
    ]);

    if (columnsError) {
      throw columnsError;
    }
    
    if (profileError) {
      console.error(profileError);
      throw profileError;
    }
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

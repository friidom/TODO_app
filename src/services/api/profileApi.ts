import { supabase } from "./supabase";
import type { ISupabaseProfile } from "../../types/data";

export async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;

  return data;
}
export async function updateProfile(profile: ISupabaseProfile) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      username: profile.username,
      full_name: profile.full_name,
      bio: profile.bio,
      avatar_url: profile.avatar_url,
    })
    .eq("id", profile.id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

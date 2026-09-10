import { supabase } from "../api/supabase";

// Path is the authorization: storage policies scope writes to the uid folder, so this path and the policy have to agree.
export async function uploadAvatar(
  file: File,
  userId: string,
): Promise<string> {
  const fileExt = file.name.split(".").pop();

  // fixed filename, not a hash — one avatar per person, upsert replaces it instead of piling up orphans
  const path = `${userId}/avatar.${fileExt}`;

  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);

  return data.publicUrl;
}

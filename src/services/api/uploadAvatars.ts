import { supabase } from "./supabase";

export async function uploadAvatar(
  file: File,
  userId: string,
): Promise<string> {
    
  const fileExt = file.name.split(".").pop();

  const fileName = `${userId}.${fileExt}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(fileName, file, {
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from("avatars")
    .getPublicUrl(fileName);

    
  return data.publicUrl;


}
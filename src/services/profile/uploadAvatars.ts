import { supabase } from "../api/supabase";

/**
 * Stores an avatar under a path only its owner may write (M14).
 *
 * **The path is the authorization.** This used to upload to `<uid>.<ext>` at
 * the bucket root, and the storage policies checked only `bucket_id` — so the
 * object key was literally the victim's user id and any authenticated account
 * could upsert over anyone's avatar. User ids are not secret; `board_roster`
 * returns one for every co-member by design.
 *
 * `20260814101000_avatar_storage_ownership.sql` scopes the INSERT and UPDATE
 * policies to `(storage.foldername(name))[1] = auth.uid()::text`, which is the
 * folder this writes into. The two halves are one change: the policy without
 * this path refuses every upload, and this path without the policy is the same
 * hole one directory deeper.
 *
 * Objects already at the old flat path stay readable — SELECT is still public,
 * so an avatar keeps rendering from the URL in `profiles.avatar_url` until its
 * owner uploads again and the row moves to the new one.
 */
export async function uploadAvatar(
  file: File,
  userId: string,
): Promise<string> {
  const fileExt = file.name.split(".").pop();

  // Fixed filename inside the folder rather than a hash or a timestamp: a
  // person has one avatar, and `upsert` replacing it is what keeps the bucket
  // from accumulating an object per upload with nothing to clean them up.
  const path = `${userId}/avatar.${fileExt}`;

  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);

  return data.publicUrl;
}

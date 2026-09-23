import { api } from "../api/client";
import type { Profile } from "./profileApi";

// Was a direct Supabase Storage upload from the browser. It is now a multipart
// POST to our own API, which is the only side that holds MinIO credentials and
// the only side that may name an object: the old version built the key from
// `${userId}/avatar.${ext}` in the browser, so both the path and the extension
// were the client's to choose.
//
// Returns the updated profile rather than a url, because the server writes
// profiles.avatar_url itself — there is no longer a second round trip in which
// the two could disagree.
export function uploadAvatar(file: File): Promise<Profile> {
  const form = new FormData();

  form.append("file", file);

  return api.post<Profile>("/users/me/avatar", form);
}

export function removeAvatar(): Promise<Profile> {
  return api.del<Profile>("/users/me/avatar");
}

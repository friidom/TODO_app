import { api } from "../api/client";
import type { ISupabaseProfile } from "../../types/data";

export type Profile = Pick<
  ISupabaseProfile,
  "id" | "username" | "full_name" | "bio" | "avatar_url" | "created_at"
>;

// Self only. There is no endpoint for another user's profile — teammate
// identity comes from the board roster, which is membership-gated and withholds
// email and bio.
export function fetchProfile(): Promise<Profile> {
  return api.get<Profile>("/users/me");
}

// Takes the whole profile because the caller keys its cache by id; only the
// three editable fields are sent, and the API ignores an id in a body anyway.
//
// avatar_url is NOT among them, and the API now refuses it: it used to be a
// free-text field the client chose, so any account could point its avatar at
// any url. It changes only through POST/DELETE /users/me/avatar.
export function updateProfile(profile: Profile): Promise<Profile> {
  return api.patch<Profile>("/users/me", {
    username: profile.username,
    full_name: profile.full_name,
    bio: profile.bio,
  });
}

import { inviteUrl } from "@/services/invites/inviteLink";
import { toast } from "@/stores/toasts";

/**
 * Puts an invite link on the clipboard and says so.
 *
 * Shared by the freshly-created link and every pending row, so "copy" means
 * the same thing and reports the same way wherever it is pressed.
 *
 * `navigator.clipboard` is unavailable on an insecure origin and can be
 * refused by permissions policy, and both failures are silent — the promise
 * rejects and nothing appears on the clipboard. The user is told rather than
 * left believing they have the link, because the link is the entire point of
 * the feature and there is no way to notice it did not work until the
 * recipient says so.
 */
export async function copyInviteLink(token: string): Promise<void> {
  const url = inviteUrl(token, window.location.origin);

  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  } catch {
    toast.error("Could not copy the link. Select it and copy manually.");
  }
}

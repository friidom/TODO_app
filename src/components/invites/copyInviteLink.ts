import { inviteUrl } from "@/services/invites/inviteLink";
import { toast } from "@/stores/toasts";

// clipboard.writeText can fail silently (insecure origin, permissions policy) — the toast is what tells them it didn't work.
export async function copyInviteLink(token: string): Promise<void> {
  const url = inviteUrl(token, window.location.origin);

  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  } catch {
    toast.error("Could not copy the link. Select it and copy manually.");
  }
}

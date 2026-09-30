import i18n from "@/components/i18n";
import { inviteUrl } from "@/services/invites/inviteLink";
import { toast } from "@/stores/toasts";

// clipboard.writeText can fail silently (insecure origin, permissions policy) — the toast is what tells them it didn't work.
export async function copyInviteLink(token: string): Promise<void> {
  const url = inviteUrl(token, window.location.origin);

  try {
    await navigator.clipboard.writeText(url);
    toast.success(i18n.t("invites.copied"));
  } catch {
    toast.error(i18n.t("invites.copyFailed"));
  }
}

import i18n from "@/components/i18n";
import type { Invitee, InviteRole } from "@/services/invites/invitesApi";

// owner isn't here and can't be — not grantable by link, create_invite refuses it too
export const INVITE_ROLE_OPTIONS: {
  value: InviteRole;
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    value: "viewer",
    labelKey: "roles.viewer",
    descriptionKey: "invites.roleViewer",
  },
  {
    value: "editor",
    labelKey: "roles.editor",
    descriptionKey: "invites.roleEditor",
  },
  {
    value: "admin",
    labelKey: "roles.admin",
    descriptionKey: "invites.roleAdmin",
  },
];

// the server clamps to 1-30 days, so nothing outside that range is worth offering
export const EXPIRY_OPTIONS = [1, 3, 7, 14, 30] as const;

export const DEFAULT_INVITE_ROLE: InviteRole = "editor";

export const DEFAULT_EXPIRY_DAYS = 7;

export function inviteeName(invitee: Invitee): string {
  return (
    invitee.full_name ||
    invitee.username ||
    invitee.email ||
    i18n.t("members.unnamed")
  );
}

import type { InviteRole } from "@/services/invites/invitesApi";

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

// create_invite clamps to 1-30 days server-side, so these are the only values worth offering
export const EXPIRY_OPTIONS = [1, 7, 30] as const;

export const DEFAULT_INVITE_ROLE: InviteRole = "editor";

export const DEFAULT_EXPIRY_DAYS = 7;

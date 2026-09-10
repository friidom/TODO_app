import type { InviteRole } from "@/services/invites/invitesApi";

// owner isn't here and can't be — not grantable by link, create_invite refuses it too
export const INVITE_ROLE_OPTIONS: {
  value: InviteRole;
  label: string;
  description: string;
}[] = [
  {
    value: "viewer",
    label: "Viewer",
    description: "Can see the board and everything on it.",
  },
  {
    value: "editor",
    label: "Editor",
    description: "Can add, edit and move work items.",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Can also change board settings and manage people.",
  },
];

// create_invite clamps to 1-30 days server-side, so these are the only values worth offering
export const EXPIRY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];

export const DEFAULT_INVITE_ROLE: InviteRole = "editor";

export const DEFAULT_EXPIRY_DAYS = 7;

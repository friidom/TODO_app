import type { InviteRole } from "@/services/invites/invitesApi";

/**
 * What the two dropdowns in the invite modal offer.
 *
 * A plain `.ts` module beside the component for the usual reason — mixing a
 * component with other exports breaks react-refresh — and the same shape
 * `constants/columns.ts` uses for the category picker.
 *
 * **Owner is not here and cannot be.** Ownership is not grantable by link
 * (invariant I6); `board_invites.role` excludes it at the column level and
 * `create_invite` refuses it, so this list is the third place that agrees
 * rather than the place that decides.
 *
 * The descriptions are the honest ones for today's permission model, not
 * aspirational: an editor can add and move work items, a viewer cannot, and an
 * admin can also change the board and manage people.
 */
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

/**
 * How long a link lasts.
 *
 * These three are the whole menu because `create_invite` clamps anything it is
 * given to 1..30 days — a fourth option outside that range would be silently
 * corrected by the server, which is worse than not offering it.
 */
export const EXPIRY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];

export const DEFAULT_INVITE_ROLE: InviteRole = "editor";

export const DEFAULT_EXPIRY_DAYS = 7;

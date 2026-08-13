/**
 * Role → badge colour, from the existing accent tokens.
 *
 * Lifted out of `MemberRow.tsx` when the invite UI needed the same palette:
 * a pending invite's role badge and a member's role badge must be the same
 * object, or "Editor" means one colour in the rail and another in the modal.
 *
 * Its own module rather than an export beside the component, for the reason
 * `memberLabels.ts` records: react-refresh cannot fast-refresh a module that
 * mixes a component with other exports.
 *
 * Owner takes the brand purple because it is the one role no control can
 * change. Keyed off a plain `string` because that is what the column is — a
 * checked text field, not an enum — and an unrecognised value falls through to
 * the neutral style rather than rendering nothing.
 */
export const ROLE_STYLES: Record<string, string> = {
  owner: "bg-brand-soft text-brand",
  admin: "bg-status-blue/15 text-status-blue",
  editor: "bg-status-green/15 text-status-green",
  viewer: "bg-ink/10 text-ink-2",
};

/** The neutral fallback, for a role this palette has no colour for. */
export const ROLE_STYLE_FALLBACK = "bg-ink/10 text-ink-2";

export function roleStyle(role: string) {
  return ROLE_STYLES[role] ?? ROLE_STYLE_FALLBACK;
}

export function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

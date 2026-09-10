// keyed off a plain string since the column is a checked text field, not an enum
export const ROLE_STYLES: Record<string, string> = {
  owner: "bg-brand-soft text-brand",
  admin: "bg-status-blue/15 text-status-blue",
  editor: "bg-status-green/15 text-status-green",
  viewer: "bg-ink/10 text-ink-2",
};

export const ROLE_STYLE_FALLBACK = "bg-ink/10 text-ink-2";

export function roleStyle(role: string) {
  return ROLE_STYLES[role] ?? ROLE_STYLE_FALLBACK;
}

export function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

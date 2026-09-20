// The org dimension ships as an optional field with one real value (§10.7), so
// that adding Director / Superadmin later widens a type rather than changing
// every signature that carries an actor. Three rules go with it, decided now:
// elevated roles widen *read* and never *write*, elevated access is logged,
// and board ownership stays immutable.
export const ORG_ROLES = ["member", "team_lead", "director", "superadmin"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export interface Actor {
  id: string;
  orgRole?: OrgRole;
}

// users_org_role_check already guarantees the column holds one of these, so
// this is not defence against the database — it is what lets the value cross
// from Prisma's `string` into OrgRole without a cast that would keep compiling
// if 0011's CHECK were ever widened without the type.
export function isOrgRole(value: string): value is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(value);
}

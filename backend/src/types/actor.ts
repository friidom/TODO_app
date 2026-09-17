// The org dimension ships as an optional field with one real value (§10.7), so
// that adding Director / Superadmin later widens a type rather than changing
// every signature that carries an actor. Three rules go with it, decided now:
// elevated roles widen *read* and never *write*, elevated access is logged,
// and board ownership stays immutable.
export type OrgRole = "member" | "team_lead" | "director" | "superadmin";

export interface Actor {
  id: string;
  orgRole?: OrgRole;
}

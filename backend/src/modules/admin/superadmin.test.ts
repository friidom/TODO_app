import { describe, expect, it } from "vitest";

import { decideSuperadmin, type RoleTarget } from "./superadmin.js";

const confirmed: RoleTarget = {
  org_role: "member",
  email_verified_at: new Date("2026-01-01"),
  deactivated_at: null,
};

const admin: RoleTarget = { ...confirmed, org_role: "superadmin" };

const decide = (
  grant: boolean,
  target: RoleTarget,
  activeSuperadmins: number,
  bootstrap = false,
) => decideSuperadmin({ grant, target, activeSuperadmins, bootstrap });

describe("decideSuperadmin", () => {
  it("grants a confirmed, active member", () => {
    expect(decide(true, confirmed, 1)).toEqual({
      kind: "apply",
      from: "member",
      to: "superadmin",
    });
  });

  it("keeps an org role that has no behaviour as the recorded starting point", () => {
    expect(decide(true, { ...confirmed, org_role: "team_lead" }, 1)).toMatchObject({
      from: "team_lead",
    });
  });

  it("is idempotent in both directions", () => {
    expect(decide(true, admin, 2)).toEqual({ kind: "unchanged" });
    expect(decide(false, confirmed, 2)).toEqual({ kind: "unchanged" });
    expect(decide(false, { ...confirmed, org_role: "director" }, 2)).toEqual({
      kind: "unchanged",
    });
  });

  it("refuses to grant to a deactivated or unconfirmed account", () => {
    expect(decide(true, { ...confirmed, deactivated_at: new Date() }, 1)).toEqual({
      kind: "refuse",
      reason: "deactivated",
    });
    expect(decide(true, { ...confirmed, email_verified_at: null }, 1)).toEqual({
      kind: "refuse",
      reason: "unverified",
    });
  });

  it("never removes the last active superadmin, including oneself", () => {
    expect(decide(false, admin, 1)).toEqual({ kind: "refuse", reason: "last_superadmin" });
    expect(decide(false, admin, 0)).toEqual({ kind: "refuse", reason: "last_superadmin" });
  });

  it("revokes when another active superadmin remains", () => {
    expect(decide(false, admin, 2)).toEqual({ kind: "apply", from: "superadmin", to: "member" });
  });

  it("lets a deactivated superadmin be revoked, since the active count does not move", () => {
    expect(decide(false, { ...admin, deactivated_at: new Date() }, 1)).toMatchObject({
      kind: "apply",
    });
  });

  it("bootstraps only while no active superadmin exists", () => {
    expect(decide(true, confirmed, 0, true)).toMatchObject({ kind: "apply" });
    expect(decide(true, confirmed, 1, true)).toEqual({
      kind: "refuse",
      reason: "superadmin_exists",
    });
    // Re-running against the account it already promoted is a no-op, not an error.
    expect(decide(true, admin, 1, true)).toEqual({ kind: "unchanged" });
  });

  it("still requires a confirmed email when bootstrapping", () => {
    expect(decide(true, { ...confirmed, email_verified_at: null }, 0, true)).toEqual({
      kind: "refuse",
      reason: "unverified",
    });
  });
});

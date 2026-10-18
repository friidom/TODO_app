import { describe, expect, it } from "vitest";

import en from "@/components/i18n/locales/en.json";
import type { AuthUser } from "@/services/auth/session";
import {
  canEnterAdmin,
  roleActionFor,
  roleAuditOutcome,
  roleOutcomeKey,
} from "./access";
import { adminSections } from "./registry";

const user = (org_role: AuthUser["org_role"]): AuthUser => ({
  id: "u1",
  email: "a@example.com",
  email_verified_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  org_role,
  profile: null,
});

const lookup = (key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      en,
    );

describe("the admin area's front door", () => {
  it("lets a superadmin in and turns everyone else away", () => {
    expect(canEnterAdmin(user("superadmin"))).toBe(true);
    expect(canEnterAdmin(user("member"))).toBe(false);
    // Org roles with no behaviour yet grant nothing either.
    expect(canEnterAdmin(user("director"))).toBe(false);
    expect(canEnterAdmin(user("team_lead"))).toBe(false);
    expect(canEnterAdmin(null)).toBe(false);
  });

  it("routes the Access section under /admin", () => {
    expect(adminSections().find((s) => s.section === "access")?.path).toBe(
      "/admin/access",
    );
  });
});

describe("roleActionFor", () => {
  it("offers a grant to a confirmed, active member", () => {
    expect(roleActionFor({ org_role: "member", status: "active" }, 1)).toEqual({
      kind: "grant",
      blocked: null,
    });
  });

  it("explains why a grant is unavailable instead of letting the server refuse it", () => {
    expect(
      roleActionFor({ org_role: "member", status: "unverified" }, 1).blocked,
    ).toBe("unverified");
    expect(
      roleActionFor({ org_role: "member", status: "deactivated" }, 1).blocked,
    ).toBe("deactivated");
  });

  it("blocks removing the last active superadmin, and only that one", () => {
    expect(
      roleActionFor({ org_role: "superadmin", status: "active" }, 1),
    ).toEqual({ kind: "revoke", blocked: "last" });
    expect(
      roleActionFor({ org_role: "superadmin", status: "active" }, 2),
    ).toEqual({ kind: "revoke", blocked: null });
    expect(
      roleActionFor({ org_role: "superadmin", status: "deactivated" }, 1),
    ).toEqual({ kind: "revoke", blocked: null });
  });
});

describe("role-change feedback", () => {
  it("has a message for every outcome, and a distinct one for removing yourself", () => {
    for (const outcome of ["granted", "revoked", "unchanged"] as const) {
      expect(typeof lookup(roleOutcomeKey(outcome, false))).toBe("string");
    }

    expect(roleOutcomeKey("revoked", true)).toBe(
      "admin.access.toast.revokedSelf",
    );
    expect(typeof lookup(roleOutcomeKey("revoked", true))).toBe("string");
  });

  it("reads each audit action as its outcome", () => {
    expect(roleAuditOutcome("user.superadmin_granted")).toBe("granted");
    expect(roleAuditOutcome("user.superadmin_revoked")).toBe("revoked");
    expect(roleAuditOutcome("user.superadmin_refused")).toBe("refused");
    expect(roleAuditOutcome("kpi_target.updated")).toBeNull();
  });
});

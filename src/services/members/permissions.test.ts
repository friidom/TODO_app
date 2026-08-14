import { describe, expect, it } from "vitest";

import {
  BOARD_ROLES,
  assignableRoles,
  canActOnMember,
  permissionsFor,
  roleRank,
} from "./permissions";

describe("permissionsFor", () => {
  it("gives a viewer read and nothing else", () => {
    const p = permissionsFor("viewer");

    expect(p.canReadBoard).toBe(true);
    expect(p.canEditTodos).toBe(false);
    expect(p.canManageColumns).toBe(false);
    expect(p.canManageMembers).toBe(false);
    expect(p.canManageAdmins).toBe(false);
    expect(p.canDeleteBoard).toBe(false);
  });

  it("gives an editor content but no member management", () => {
    const p = permissionsFor("editor");

    expect(p.canEditTodos).toBe(true);
    expect(p.canManageColumns).toBe(true);
    expect(p.canManageMembers).toBe(false);
  });

  it("gives an admin members but not admins, and not the board itself", () => {
    const p = permissionsFor("admin");

    expect(p.canManageMembers).toBe(true);
    expect(p.canManageAdmins).toBe(false);
    expect(p.canDeleteBoard).toBe(false);
  });

  it("gives an owner everything", () => {
    const p = permissionsFor("owner");

    expect(Object.values(p).every((v) => v === true || v === "owner")).toBe(
      true,
    );
  });

  it("gives a non-member nothing", () => {
    // Null is the shape board_role() returns for a stranger, and the two junk
    // cases are what a hand-edited cache or a renamed role would produce.
    for (const role of [null, undefined, "", "admiral"]) {
      expect(permissionsFor(role).canReadBoard).toBe(false);
      expect(permissionsFor(role).role).toBeNull();
    }
  });
});

describe("roleRank", () => {
  it("orders the hierarchy", () => {
    expect(roleRank("viewer")).toBeLessThan(roleRank("editor")!);
    expect(roleRank("editor")).toBeLessThan(roleRank("admin")!);
    expect(roleRank("admin")).toBeLessThan(roleRank("owner")!);
  });

  it("is null for anything not a role", () => {
    expect(roleRank("admiral")).toBeNull();
    expect(roleRank(null)).toBeNull();
  });
});

describe("canActOnMember", () => {
  it("never targets the owner, from any actor including the owner", () => {
    for (const actor of BOARD_ROLES) {
      expect(canActOnMember(actor, "owner")).toBe(false);
    }
  });

  it("lets an owner manage admins, editors and viewers", () => {
    expect(canActOnMember("owner", "admin")).toBe(true);
    expect(canActOnMember("owner", "editor")).toBe(true);
    expect(canActOnMember("owner", "viewer")).toBe(true);
  });

  it("stops an admin at another admin — the rule a plain admin-check misses", () => {
    expect(canActOnMember("admin", "admin")).toBe(false);
    expect(canActOnMember("admin", "editor")).toBe(true);
    expect(canActOnMember("admin", "viewer")).toBe(true);
  });

  it("lets editors and viewers manage nobody", () => {
    for (const target of BOARD_ROLES) {
      expect(canActOnMember("editor", target)).toBe(false);
      expect(canActOnMember("viewer", target)).toBe(false);
    }
  });

  it("refuses a non-member actor and an unknown target", () => {
    expect(canActOnMember(null, "viewer")).toBe(false);
    expect(canActOnMember("owner", null)).toBe(false);
    expect(canActOnMember("owner", "admiral")).toBe(false);
  });
});

describe("assignableRoles", () => {
  it("never offers owner, to anybody", () => {
    for (const actor of BOARD_ROLES) {
      expect(assignableRoles(actor)).not.toContain("owner");
    }
  });

  it("offers an owner everything below owner", () => {
    expect(assignableRoles("owner")).toEqual(["viewer", "editor", "admin"]);
  });

  it("stops an admin below admin", () => {
    expect(assignableRoles("admin")).toEqual(["viewer", "editor"]);
  });

  it("offers editors, viewers and non-members nothing", () => {
    expect(assignableRoles("editor")).toEqual([]);
    expect(assignableRoles("viewer")).toEqual([]);
    expect(assignableRoles(null)).toEqual([]);
  });

  it("agrees with canActOnMember about every pair", () => {
    // The two are used together — the menu lists assignableRoles on a row
    // canActOnMember allowed — so a disagreement would offer a control whose
    // every option is refused.
    for (const actor of BOARD_ROLES) {
      for (const target of assignableRoles(actor)) {
        expect(canActOnMember(actor, target)).toBe(true);
      }
    }
  });
});

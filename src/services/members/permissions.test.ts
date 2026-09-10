import { describe, expect, it } from "vitest";

import {
  BOARD_ROLES,
  assignableRoles,
  canActOnMember,
  canDeleteAttachment,
  canDeleteComment,
  canEditComment,
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
    for (const actor of BOARD_ROLES) {
      for (const target of assignableRoles(actor)) {
        expect(canActOnMember(actor, target)).toBe(true);
      }
    }
  });
});

describe("comment permissions — M7-01", () => {
  it("lets every member comment, viewer included", () => {
    for (const role of BOARD_ROLES) {
      expect(permissionsFor(role).canComment).toBe(true);
    }

    expect(permissionsFor(null).canComment).toBe(false);
  });

  it("gives moderation to admins and owners only", () => {
    expect(permissionsFor("viewer").canModerateComments).toBe(false);
    expect(permissionsFor("editor").canModerateComments).toBe(false);
    expect(permissionsFor("admin").canModerateComments).toBe(true);
    expect(permissionsFor("owner").canModerateComments).toBe(true);
  });

  it("lets the author edit their own comment", () => {
    expect(canEditComment("u-1", "u-1")).toBe(true);
  });

  it("LETS NOBODY EDIT SOMEONE ELSE'S — there is no rank that widens it", () => {
    expect(canEditComment("u-2", "u-1")).toBe(false);
    expect(canDeleteComment("admin", "u-2", "u-1")).toBe(true);
    expect(canEditComment("u-2", "u-1")).toBe(false);
  });

  it("treats a missing session as nobody", () => {
    expect(canEditComment(undefined, "u-1")).toBe(false);
    expect(canEditComment(null, "u-1")).toBe(false);
    expect(canEditComment(undefined, undefined as unknown as string)).toBe(
      false,
    );
  });

  it("lets an author delete their own comment at any rank", () => {
    expect(canDeleteComment("viewer", "u-1", "u-1")).toBe(true);
    expect(canDeleteComment("editor", "u-1", "u-1")).toBe(true);
  });

  it("lets admins and owners delete anyone's, and editors nobody else's", () => {
    expect(canDeleteComment("admin", "u-2", "u-1")).toBe(true);
    expect(canDeleteComment("owner", "u-2", "u-1")).toBe(true);
    expect(canDeleteComment("editor", "u-2", "u-1")).toBe(false);
    expect(canDeleteComment("viewer", "u-2", "u-1")).toBe(false);
  });

  it("gives a non-member nothing, even over a comment carrying their id", () => {
    expect(canDeleteComment(null, "u-1", "u-1")).toBe(false);
    expect(canDeleteComment("nonsense", "u-1", "u-1")).toBe(false);
  });
});

describe("attachment permissions — M32", () => {
  it("REFUSES A VIEWER, WHERE COMMENTING ALLOWS ONE", () => {
    expect(permissionsFor("viewer").canComment).toBe(true);
    expect(permissionsFor("viewer").canAttach).toBe(false);

    expect(permissionsFor("editor").canAttach).toBe(true);
    expect(permissionsFor("admin").canAttach).toBe(true);
    expect(permissionsFor("owner").canAttach).toBe(true);
    expect(permissionsFor(null).canAttach).toBe(false);
  });

  it("tracks canEditTodos, which is what makes it the content matrix", () => {
    for (const role of [...BOARD_ROLES, null, "admiral"]) {
      const p = permissionsFor(role);

      expect(p.canAttach).toBe(p.canEditTodos);
    }
  });

  it("lets an uploader delete their own at editor rank and above", () => {
    expect(canDeleteAttachment("editor", "u-1", "u-1")).toBe(true);
    expect(canDeleteAttachment("admin", "u-1", "u-1")).toBe(true);
  });

  it("lets admins and owners delete anyone's, and editors nobody else's", () => {
    expect(canDeleteAttachment("admin", "u-2", "u-1")).toBe(true);
    expect(canDeleteAttachment("owner", "u-2", "u-1")).toBe(true);
    expect(canDeleteAttachment("editor", "u-2", "u-1")).toBe(false);
  });

  it("gives a viewer no delete, not even over a row carrying their id", () => {
    expect(canDeleteAttachment("viewer", "u-1", "u-1")).toBe(false);
  });

  it("gives a non-member nothing", () => {
    expect(canDeleteAttachment(null, "u-1", "u-1")).toBe(false);
    expect(canDeleteAttachment("nonsense", "u-1", "u-1")).toBe(false);
  });

  it("TREATS AN ORPHANED FILE AS NOBODY'S, NOT AS EVERYBODY'S", () => {
    expect(canDeleteAttachment("editor", null, null)).toBe(false);
    expect(canDeleteAttachment("editor", undefined, null)).toBe(false);
    expect(canDeleteAttachment("editor", "u-1", null)).toBe(false);
    expect(canDeleteAttachment("admin", null, null)).toBe(true);
  });
});

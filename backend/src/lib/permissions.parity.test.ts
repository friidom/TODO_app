import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assignableRoles,
  BOARD_ROLES,
  canActOnMember,
  canDeleteAttachment,
  canDeleteComment,
  canEditComment,
  permissionsFor,
  roleRank,
} from "./permissions.js";

// The same assertions run in both packages against one fixture. permissions.ts
// is deliberately duplicated (§10.3) because a shared workspace package would
// add build tooling this project does not have; this fixture is the
// mitigation. If the two copies drift, one of these two tests fails instead of
// a board quietly disagreeing with the server.
const fixture = JSON.parse(
  readFileSync(new URL("../../../permissions-matrix.json", import.meta.url), "utf8"),
) as {
  boardRoles: string[];
  roleRank: { role: string | null; expected: number | null }[];
  permissionsFor: { role: string | null; expected: Record<string, unknown> }[];
  canEditComment: { userId: string | null; authorId: string; expected: boolean }[];
  canDeleteComment: {
    actorRole: string | null;
    userId: string | null;
    authorId: string;
    expected: boolean;
  }[];
  canDeleteAttachment: {
    actorRole: string | null;
    userId: string | null;
    uploaderId: string | null;
    expected: boolean;
  }[];
  canActOnMember: { actorRole: string | null; targetRole: string | null; expected: boolean }[];
  assignableRoles: { role: string | null; expected: string[] }[];
};

describe("permission matrix parity", () => {
  it("agrees on the role list", () => {
    expect([...BOARD_ROLES]).toEqual(fixture.boardRoles);
  });

  it(`agrees on roleRank for all ${fixture.roleRank.length} cases`, () => {
    for (const { role, expected } of fixture.roleRank) {
      expect(roleRank(role), `roleRank(${JSON.stringify(role)})`).toBe(expected);
    }
  });

  it(`agrees on permissionsFor for all ${fixture.permissionsFor.length} cases`, () => {
    for (const { role, expected } of fixture.permissionsFor) {
      expect(permissionsFor(role), `permissionsFor(${JSON.stringify(role)})`).toEqual(expected);
    }
  });

  it(`agrees on canEditComment for all ${fixture.canEditComment.length} cases`, () => {
    for (const { userId, authorId, expected } of fixture.canEditComment) {
      expect(canEditComment(userId, authorId), `canEditComment(${userId}, ${authorId})`).toBe(
        expected,
      );
    }
  });

  it(`agrees on canDeleteComment for all ${fixture.canDeleteComment.length} cases`, () => {
    for (const { actorRole, userId, authorId, expected } of fixture.canDeleteComment) {
      expect(
        canDeleteComment(actorRole, userId, authorId),
        `canDeleteComment(${actorRole}, ${userId}, ${authorId})`,
      ).toBe(expected);
    }
  });

  it(`agrees on canDeleteAttachment for all ${fixture.canDeleteAttachment.length} cases`, () => {
    for (const { actorRole, userId, uploaderId, expected } of fixture.canDeleteAttachment) {
      expect(
        canDeleteAttachment(actorRole, userId, uploaderId),
        `canDeleteAttachment(${actorRole}, ${userId}, ${uploaderId})`,
      ).toBe(expected);
    }
  });

  it(`agrees on canActOnMember for all ${fixture.canActOnMember.length} cases`, () => {
    for (const { actorRole, targetRole, expected } of fixture.canActOnMember) {
      expect(
        canActOnMember(actorRole, targetRole),
        `canActOnMember(${actorRole}, ${targetRole})`,
      ).toBe(expected);
    }
  });

  it(`agrees on assignableRoles for all ${fixture.assignableRoles.length} cases`, () => {
    for (const { role, expected } of fixture.assignableRoles) {
      expect(assignableRoles(role), `assignableRoles(${JSON.stringify(role)})`).toEqual(expected);
    }
  });
});

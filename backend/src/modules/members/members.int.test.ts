import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

let client: TestClient;

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(resetDatabase);

afterAll(async () => {
  await client.close();
  await disconnect();
});

interface Entry {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string;
}

type Role = "viewer" | "editor" | "admin";

async function boardWith(roles: Role[]) {
  const owner = await makeUser("owner");
  const members: Record<string, TestUser> = {};

  for (const role of roles) {
    const user = await makeUser(role);

    await addMember(owner.boardId, user, role, owner.id);
    members[role] = user;
  }

  return { owner, boardId: owner.boardId, members };
}

function membersUrl(boardId: string, suffix = ""): string {
  return `/api/v1/boards/${boardId}/members${suffix}`;
}

describe("GET /boards/:boardId/members", () => {
  it("returns every member, not just the caller", async () => {
    const { owner, boardId, members } = await boardWith(["viewer", "editor", "admin"]);
    const response = await client.get<Entry[]>(membersUrl(boardId), { token: members.viewer!.token });

    expect(response.status).toBe(200);
    expect(new Set(response.body.map((m) => m.id))).toEqual(
      new Set([owner.id, members.viewer!.id, members.editor!.id, members.admin!.id]),
    );
  });

  it("exposes exactly the roster's six fields, and never email or bio", async () => {
    const { owner, boardId } = await boardWith([]);
    const response = await client.get<Entry[]>(membersUrl(boardId), { token: owner.token });

    expect(Object.keys(response.body[0]!).sort()).toEqual([
      "avatar_url",
      "full_name",
      "id",
      "joined_at",
      "role",
      "username",
    ]);
  });

  it("orders by joined_at so the list is stable", async () => {
    const { owner, boardId } = await boardWith(["viewer", "editor"]);
    const response = await client.get<Entry[]>(membersUrl(boardId), { token: owner.token });
    const times = response.body.map((m) => new Date(m.joined_at).getTime());

    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("answers 404 for a non-member", async () => {
    const { boardId } = await boardWith([]);
    const outsider = await makeUser("outsider");

    expect((await client.get(membersUrl(boardId), { token: outsider.token })).status).toBe(404);
  });
});

describe("POST /boards/:boardId/members", () => {
  it("lets an owner add at any assignable role", async () => {
    const { owner, boardId } = await boardWith([]);

    for (const role of ["viewer", "editor", "admin"] as const) {
      const target = await makeUser(`t${role}`);
      const response = await client.post<Entry>(
        membersUrl(boardId),
        { user_id: target.id, role },
        { token: owner.token },
      );

      expect(response.status, role).toBe(201);
      expect(response.body.role).toBe(role);
    }
  });

  it("lets an admin add a viewer and an editor", async () => {
    const { boardId, members } = await boardWith(["admin"]);

    for (const role of ["viewer", "editor"] as const) {
      const target = await makeUser(`t${role}`);
      const response = await client.post(
        membersUrl(boardId),
        { user_id: target.id, role },
        { token: members.admin!.token },
      );

      expect(response.status, role).toBe(201);
    }
  });

  // The rule the SQL states as "an admin cannot mint an admin".
  it("REFUSES an admin adding another admin", async () => {
    const { boardId, members } = await boardWith(["admin"]);
    const target = await makeUser("target");

    const response = await client.post(
      membersUrl(boardId),
      { user_id: target.id, role: "admin" },
      { token: members.admin!.token },
    );

    expect(response.status).toBe(403);
  });

  it("refuses 'owner' as a role, at every actor rank", async () => {
    const { owner, boardId, members } = await boardWith(["admin"]);
    const target = await makeUser("target");

    for (const actor of [owner, members.admin!]) {
      const response = await client.post(
        membersUrl(boardId),
        { user_id: target.id, role: "owner" },
        { token: actor.token },
      );

      expect([400, 403]).toContain(response.status);
      expect(
        await prisma.board_members.count({ where: { board_id: boardId, role: "owner" } }),
      ).toBe(1);
    }
  });

  it("refuses an unrecognised role", async () => {
    const { owner, boardId } = await boardWith([]);
    const target = await makeUser("target");

    expect(
      (
        await client.post(
          membersUrl(boardId),
          { user_id: target.id, role: "superuser" },
          { token: owner.token },
        )
      ).status,
    ).toBe(400);
  });

  it("refuses a viewer and an editor outright", async () => {
    const { boardId, members } = await boardWith(["viewer", "editor"]);
    const target = await makeUser("target");

    for (const role of ["viewer", "editor"] as const) {
      const response = await client.post(
        membersUrl(boardId),
        { user_id: target.id, role: "viewer" },
        { token: members[role]!.token },
      );

      expect(response.status, role).toBe(403);
    }
  });

  it("refuses targeting the board owner", async () => {
    const { owner, boardId, members } = await boardWith(["admin"]);

    const response = await client.post(
      membersUrl(boardId),
      { user_id: owner.id, role: "viewer" },
      { token: members.admin!.token },
    );

    expect(response.status).toBe(403);
    expect(
      await prisma.board_members.findUniqueOrThrow({
        where: { board_id_user_id: { board_id: boardId, user_id: owner.id } },
        select: { role: true },
      }),
    ).toEqual({ role: "owner" });
  });

  it("reports an unknown user as a bad request, not a 500", async () => {
    const { owner, boardId } = await boardWith([]);

    const response = await client.post(
      membersUrl(boardId),
      { user_id: randomUUID(), role: "viewer" },
      { token: owner.token },
    );

    expect(response.status).toBe(400);
  });

  it("answers 409 for someone already on the board", async () => {
    const { owner, boardId, members } = await boardWith(["viewer"]);

    const response = await client.post<{ error: { code: string } }>(
      membersUrl(boardId),
      { user_id: members.viewer!.id, role: "editor" },
      { token: owner.token },
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("conflict");
  });

  it("admits exactly one of two concurrent adds of the same person", async () => {
    const { owner, boardId } = await boardWith([]);
    const target = await makeUser("target");

    const results = await Promise.all([
      client.post(membersUrl(boardId), { user_id: target.id, role: "viewer" }, { token: owner.token }),
      client.post(membersUrl(boardId), { user_id: target.id, role: "editor" }, { token: owner.token }),
    ]);

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(
      await prisma.board_members.count({ where: { board_id: boardId, user_id: target.id } }),
    ).toBe(1);
  });

  it("stamps the membership activity with the acting admin", async () => {
    const { owner, boardId } = await boardWith([]);
    const target = await makeUser("target");

    await client.post(
      membersUrl(boardId),
      { user_id: target.id, role: "viewer" },
      { token: owner.token },
    );

    const activity = await prisma.activities.findFirst({
      where: { board_id: boardId, entity_type: "member", entity_id: target.id },
      select: { actor_id: true },
    });

    expect(activity?.actor_id).toBe(owner.id);
  });
});

describe("PATCH /boards/:boardId/members/:userId", () => {
  it("lets an owner change a member's role", async () => {
    const { owner, boardId, members } = await boardWith(["viewer"]);

    const response = await client.patch<Entry>(
      membersUrl(boardId, `/${members.viewer!.id}`),
      { role: "editor" },
      { token: owner.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("editor");
  });

  it("REFUSES an admin promoting someone to admin", async () => {
    const { boardId, members } = await boardWith(["admin", "viewer"]);

    const response = await client.patch(
      membersUrl(boardId, `/${members.viewer!.id}`),
      { role: "admin" },
      { token: members.admin!.token },
    );

    expect(response.status).toBe(403);
  });

  it("REFUSES an admin acting on another admin", async () => {
    const { owner, boardId, members } = await boardWith(["admin"]);
    const second = await makeUser("admin2");

    await addMember(boardId, second, "admin", owner.id);

    const response = await client.patch(
      membersUrl(boardId, `/${second.id}`),
      { role: "viewer" },
      { token: members.admin!.token },
    );

    expect(response.status).toBe(403);
  });

  it("refuses changing the owner's role, even by the owner", async () => {
    const { owner, boardId } = await boardWith([]);

    const response = await client.patch(
      membersUrl(boardId, `/${owner.id}`),
      { role: "admin" },
      { token: owner.token },
    );

    expect(response.status).toBe(403);
  });

  it("refuses 'owner' as the new role", async () => {
    const { owner, boardId, members } = await boardWith(["viewer"]);

    const response = await client.patch(
      membersUrl(boardId, `/${members.viewer!.id}`),
      { role: "owner" },
      { token: owner.token },
    );

    expect([400, 403]).toContain(response.status);
    expect(
      await prisma.board_members.count({ where: { board_id: boardId, role: "owner" } }),
    ).toBe(1);
  });

  it("answers 404 for someone who is not a member of this board", async () => {
    const { owner, boardId } = await boardWith([]);
    const stranger = await makeUser("stranger");

    const response = await client.patch(
      membersUrl(boardId, `/${stranger.id}`),
      { role: "viewer" },
      { token: owner.token },
    );

    expect(response.status).toBe(404);
  });

  // The IDOR shape that matters: a real membership, but on another board.
  it("cannot reach a membership on a different board", async () => {
    const alice = await makeUser("alice");
    const mallory = await makeUser("mallory");
    const victim = await makeUser("victim");

    await addMember(mallory.boardId, victim, "admin", mallory.id);

    const response = await client.patch(
      membersUrl(alice.boardId, `/${victim.id}`),
      { role: "viewer" },
      { token: alice.token },
    );

    expect(response.status).toBe(404);

    const untouched = await prisma.board_members.findUniqueOrThrow({
      where: { board_id_user_id: { board_id: mallory.boardId, user_id: victim.id } },
      select: { role: true },
    });

    expect(untouched.role).toBe("admin");
  });

  it("refuses an editor and a viewer with 403", async () => {
    const { boardId, members } = await boardWith(["editor", "viewer"]);

    for (const role of ["editor", "viewer"] as const) {
      const response = await client.patch(
        membersUrl(boardId, `/${members.viewer!.id}`),
        { role: "editor" },
        { token: members[role]!.token },
      );

      expect(response.status, role).toBe(403);
    }
  });
});

describe("DELETE /boards/:boardId/members/:userId", () => {
  it("lets an owner remove a member", async () => {
    const { owner, boardId, members } = await boardWith(["editor"]);

    expect(
      (
        await client.del(membersUrl(boardId, `/${members.editor!.id}`), undefined, {
          token: owner.token,
        })
      ).status,
    ).toBe(204);
    expect(
      await prisma.board_members.count({ where: { board_id: boardId, user_id: members.editor!.id } }),
    ).toBe(0);
  });

  it("REFUSES an admin removing another admin", async () => {
    const { owner, boardId, members } = await boardWith(["admin"]);
    const second = await makeUser("admin2");

    await addMember(boardId, second, "admin", owner.id);

    expect(
      (
        await client.del(membersUrl(boardId, `/${second.id}`), undefined, {
          token: members.admin!.token,
        })
      ).status,
    ).toBe(403);
  });

  it("refuses removing the board owner, by anyone including the owner", async () => {
    const { owner, boardId, members } = await boardWith(["admin"]);

    for (const actor of [owner, members.admin!]) {
      const response = await client.del(membersUrl(boardId, `/${owner.id}`), undefined, {
        token: actor.token,
      });

      expect(response.status).toBe(403);
    }

    expect(
      await prisma.board_members.count({ where: { board_id: boardId, user_id: owner.id } }),
    ).toBe(1);
  });

  it("refuses an admin removing themselves through the administration path", async () => {
    const { boardId, members } = await boardWith(["admin"]);

    const response = await client.del(membersUrl(boardId, `/${members.admin!.id}`), undefined, {
      token: members.admin!.token,
    });

    expect(response.status).toBe(403);
  });
});

describe("DELETE /boards/:boardId/members/me", () => {
  it("lets a member leave", async () => {
    const { boardId, members } = await boardWith(["editor"]);

    expect(
      (await client.del(membersUrl(boardId, "/me"), undefined, { token: members.editor!.token }))
        .status,
    ).toBe(204);
    expect(
      await prisma.board_members.count({ where: { board_id: boardId, user_id: members.editor!.id } }),
    ).toBe(0);
  });

  it("lets an admin leave, which the administration path refuses", async () => {
    const { boardId, members } = await boardWith(["admin"]);

    expect(
      (await client.del(membersUrl(boardId, "/me"), undefined, { token: members.admin!.token }))
        .status,
    ).toBe(204);
  });

  it("refuses the owner", async () => {
    const { owner, boardId } = await boardWith([]);

    expect(
      (await client.del(membersUrl(boardId, "/me"), undefined, { token: owner.token })).status,
    ).toBe(403);
    expect(
      await prisma.board_members.count({ where: { board_id: boardId, user_id: owner.id } }),
    ).toBe(1);
  });

  it("answers 404 for a non-member, with nothing to leave", async () => {
    const { boardId } = await boardWith([]);
    const outsider = await makeUser("outsider");

    expect(
      (await client.del(membersUrl(boardId, "/me"), undefined, { token: outsider.token })).status,
    ).toBe(404);
  });

  it("does not let 'me' be read as a user id by the :userId route", async () => {
    const { boardId, members } = await boardWith(["viewer"]);

    const response = await client.del(membersUrl(boardId, "/me"), undefined, {
      token: members.viewer!.token,
    });

    expect(response.status).toBe(204);
  });
});

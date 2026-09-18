import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { sha256 } from "../../lib/tokens.js";
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

interface Created {
  id: string;
  token: string;
  role: string;
  expires_at: string;
  email: string | null;
  board_id: string;
}

function invitesUrl(boardId: string): string {
  return `/api/v1/boards/${boardId}/invites`;
}

async function invite(
  actor: TestUser,
  boardId: string,
  body: Record<string, unknown>,
): Promise<Created> {
  const response = await client.post<Created>(invitesUrl(boardId), body, { token: actor.token });

  if (response.status !== 201) {
    throw new Error(`invite failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

describe("POST /boards/:boardId/invites — the rank ceiling", () => {
  it("lets an owner invite at viewer, editor and admin", async () => {
    const owner = await makeUser("owner");

    for (const role of ["viewer", "editor", "admin"] as const) {
      const response = await client.post(invitesUrl(owner.boardId), { role }, { token: owner.token });

      expect(response.status, role).toBe(201);
    }
  });

  it("lets an admin invite a viewer and an editor", async () => {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");

    await addMember(owner.boardId, admin, "admin", owner.id);

    for (const role of ["viewer", "editor"] as const) {
      const response = await client.post(invitesUrl(owner.boardId), { role }, { token: admin.token });

      expect(response.status, role).toBe(201);
    }
  });

  // The denial a naive "caller is admin or owner" check would let through.
  it("REFUSES an admin inviting an admin", async () => {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");

    await addMember(owner.boardId, admin, "admin", owner.id);

    const response = await client.post(
      invitesUrl(owner.boardId),
      { role: "admin" },
      { token: admin.token },
    );

    expect(response.status).toBe(403);
  });

  it("refuses 'owner' from anyone, including the owner", async () => {
    const owner = await makeUser("owner");
    const response = await client.post(
      invitesUrl(owner.boardId),
      { role: "owner" },
      { token: owner.token },
    );

    expect([400, 403]).toContain(response.status);
    expect(await prisma.board_invites.count({ where: { role: "owner" } })).toBe(0);
  });

  it("refuses an editor and a viewer outright", async () => {
    const owner = await makeUser("owner");

    for (const role of ["editor", "viewer"] as const) {
      const member = await makeUser(role);

      await addMember(owner.boardId, member, role, owner.id);

      const response = await client.post(
        invitesUrl(owner.boardId),
        { role: "viewer" },
        { token: member.token },
      );

      expect(response.status, role).toBe(403);
    }
  });

  it("answers 404 for a non-member", async () => {
    const owner = await makeUser("owner");
    const outsider = await makeUser("outsider");

    expect(
      (await client.post(invitesUrl(owner.boardId), { role: "viewer" }, { token: outsider.token }))
        .status,
    ).toBe(404);
  });
});

describe("POST /boards/:boardId/invites — the token and the expiry clamp", () => {
  it("returns the plaintext token once and stores only its hash", async () => {
    const owner = await makeUser("owner");
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    expect(created.token).toBeTruthy();

    const row = await prisma.board_invites.findUniqueOrThrow({
      where: { id: created.id },
      select: { token_hash: true },
    });

    expect(row.token_hash).toBe(sha256(created.token));
    expect(row.token_hash).not.toBe(created.token);
  });

  it("never returns token_hash on any read", async () => {
    const owner = await makeUser("owner");

    await invite(owner, owner.boardId, { role: "viewer" });

    const listed = await client.get<Record<string, unknown>[]>(invitesUrl(owner.boardId), {
      token: owner.token,
    });

    expect(listed.status).toBe(200);
    expect(listed.body[0]).not.toHaveProperty("token_hash");
    expect(listed.body[0]).not.toHaveProperty("token");
  });

  it("gives two invites two different tokens", async () => {
    const owner = await makeUser("owner");
    const [a, b] = [
      await invite(owner, owner.boardId, { role: "viewer" }),
      await invite(owner, owner.boardId, { role: "viewer" }),
    ];

    expect(a.token).not.toBe(b.token);
  });

  // Clamps rather than rejects, which is what the SQL did.
  it("clamps an absurd expiry to 30 days instead of refusing it", async () => {
    const owner = await makeUser("owner");
    const created = await invite(owner, owner.boardId, {
      role: "viewer",
      expires_in_days: 9999,
    });

    const days = (new Date(created.expires_at).getTime() - Date.now()) / 86_400_000;

    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30.1);
  });

  it("clamps zero and negative up to one day", async () => {
    const owner = await makeUser("owner");

    for (const requested of [0, -5]) {
      const created = await invite(owner, owner.boardId, {
        role: "viewer",
        expires_in_days: requested,
      });
      const days = (new Date(created.expires_at).getTime() - Date.now()) / 86_400_000;

      expect(days, String(requested)).toBeGreaterThan(0.9);
      expect(days, String(requested)).toBeLessThanOrEqual(1.1);
    }
  });

  it("defaults to seven days", async () => {
    const owner = await makeUser("owner");
    const created = await invite(owner, owner.boardId, { role: "viewer" });
    const days = (new Date(created.expires_at).getTime() - Date.now()) / 86_400_000;

    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7.1);
  });
});

describe("POST /boards/:boardId/invites — addressed invites", () => {
  it("refuses an address with no account behind it", async () => {
    const owner = await makeUser("owner");
    const response = await client.post(
      invitesUrl(owner.boardId),
      { role: "viewer", email: "nobody@nowhere.invalid" },
      { token: owner.token },
    );

    expect(response.status).toBe(400);
  });

  it("refuses inviting yourself", async () => {
    const owner = await makeUser("owner");
    const response = await client.post(
      invitesUrl(owner.boardId),
      { role: "viewer", email: owner.email },
      { token: owner.token },
    );

    expect(response.status).toBe(400);
  });

  it("refuses someone already on the board", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "viewer", owner.id);

    const response = await client.post(
      invitesUrl(owner.boardId),
      { role: "editor", email: member.email },
      { token: owner.token },
    );

    expect(response.status).toBe(409);
  });

  it("refuses a second live invitation to the same person", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("target");

    await invite(owner, owner.boardId, { role: "viewer", email: target.email });

    const response = await client.post(
      invitesUrl(owner.boardId),
      { role: "viewer", email: target.email },
      { token: owner.token },
    );

    expect(response.status).toBe(409);
  });

  it("stores the address lower-cased and matches case-insensitively", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("target");

    const created = await invite(owner, owner.boardId, {
      role: "viewer",
      email: target.email.toUpperCase(),
    });

    expect(created.email).toBe(target.email.toLowerCase());
  });

  it("notifies the invitee, via the trigger", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("target");

    await invite(owner, owner.boardId, { role: "viewer", email: target.email });

    const notifications = await prisma.notifications.findMany({
      where: { user_id: target.id, type: "invite" },
      select: { actor_id: true, board_id: true },
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.actor_id).toBe(owner.id);
  });
});

describe("POST /invites/accept", () => {
  it("admits the token holder at the invited role", async () => {
    const owner = await makeUser("owner");
    const guest = await makeUser("guest");
    const created = await invite(owner, owner.boardId, { role: "editor" });

    const response = await client.post<{ status: string; board_id: string }>(
      "/api/v1/invites/accept",
      { token: created.token },
      { token: guest.token },
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "accepted", board_id: owner.boardId });

    const membership = await prisma.board_members.findUniqueOrThrow({
      where: { board_id_user_id: { board_id: owner.boardId, user_id: guest.id } },
      select: { role: true },
    });

    expect(membership.role).toBe("editor");
  });

  // Two clicks on one link must not both be admitted. The FOR UPDATE lock in
  // lockByTokenHash is the only thing preventing it.
  it("ADMITS EXACTLY ONE of two concurrent accepts by different people", async () => {
    const owner = await makeUser("owner");
    const [first, second] = [await makeUser("first"), await makeUser("second")];
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    const results = await Promise.all([
      client.post("/api/v1/invites/accept", { token: created.token }, { token: first.token }),
      client.post("/api/v1/invites/accept", { token: created.token }, { token: second.token }),
    ]);

    const admitted = results.filter((r) => r.status === 200);

    expect(admitted).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);

    const members = await prisma.board_members.count({
      where: { board_id: owner.boardId, user_id: { in: [first.id, second.id] } },
    });

    expect(members).toBe(1);
  });

  it("is a clean no-op when the same person clicks twice", async () => {
    const owner = await makeUser("owner");
    const guest = await makeUser("guest");
    const created = await invite(owner, owner.boardId, { role: "editor" });

    await client.post("/api/v1/invites/accept", { token: created.token }, { token: guest.token });

    const second = await client.post<{ status: string }>(
      "/api/v1/invites/accept",
      { token: created.token },
      { token: guest.token },
    );

    expect(second.status).toBe(200);
    expect(second.body.status).toBe("already_member");
  });

  it("does not change an existing role on a repeat accept", async () => {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");

    await addMember(owner.boardId, admin, "admin", owner.id);

    const created = await invite(owner, owner.boardId, { role: "viewer" });

    const response = await client.post<{ status: string }>(
      "/api/v1/invites/accept",
      { token: created.token },
      { token: admin.token },
    );

    expect(response.body.status).toBe("already_member");

    const membership = await prisma.board_members.findUniqueOrThrow({
      where: { board_id_user_id: { board_id: owner.boardId, user_id: admin.id } },
      select: { role: true },
    });

    expect(membership.role).toBe("admin");
  });

  it("treats a revoked token and a token that never existed identically", async () => {
    const owner = await makeUser("owner");
    const guest = await makeUser("guest");
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    await client.del(`/api/v1/invites/${created.id}`, undefined, { token: owner.token });

    const revoked = await client.post(
      "/api/v1/invites/accept",
      { token: created.token },
      { token: guest.token },
    );
    const never = await client.post(
      "/api/v1/invites/accept",
      { token: "never-existed-at-all" },
      { token: guest.token },
    );

    expect(revoked.status).toBe(404);
    expect(JSON.stringify(revoked.body)).toBe(JSON.stringify(never.body));
  });

  it("refuses an expired invitation", async () => {
    const owner = await makeUser("owner");
    const guest = await makeUser("guest");
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    await prisma.board_invites.update({
      where: { id: created.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    const response = await client.post(
      "/api/v1/invites/accept",
      { token: created.token },
      { token: guest.token },
    );

    expect(response.status).toBe(400);
  });

  it("needs a token of its own — an invite is not a way in without an account", async () => {
    const owner = await makeUser("owner");
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    expect(
      (await client.post("/api/v1/invites/accept", { token: created.token })).status,
    ).toBe(401);
  });

  it("refuses a body carrying both credentials, and one carrying neither", async () => {
    const owner = await makeUser("owner");
    const guest = await makeUser("guest");
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    for (const body of [
      { token: created.token, invite_id: created.id },
      {},
    ]) {
      const response = await client.post("/api/v1/invites/accept", body, { token: guest.token });

      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("accepts by invite_id only for the addressee", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("target");
    const stranger = await makeUser("stranger");
    const created = await invite(owner, owner.boardId, { role: "viewer", email: target.email });

    const wrong = await client.post(
      "/api/v1/invites/accept",
      { invite_id: created.id },
      { token: stranger.token },
    );

    expect(wrong.status).toBe(404);

    const right = await client.post<{ status: string }>(
      "/api/v1/invites/accept",
      { invite_id: created.id },
      { token: target.token },
    );

    expect(right.status).toBe(200);
    expect(right.body.status).toBe("accepted");
  });

  it("cannot accept a link invite by id, since it has no addressee", async () => {
    const owner = await makeUser("owner");
    const guest = await makeUser("guest");
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    expect(
      (
        await client.post(
          "/api/v1/invites/accept",
          { invite_id: created.id },
          { token: guest.token },
        )
      ).status,
    ).toBe(404);
  });
});

describe("POST /invites/decline", () => {
  it("lets the addressee decline, deleting the row", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("target");
    const created = await invite(owner, owner.boardId, { role: "viewer", email: target.email });

    expect(
      (await client.post("/api/v1/invites/decline", { invite_id: created.id }, { token: target.token }))
        .status,
    ).toBe(204);
    expect(await prisma.board_invites.count({ where: { id: created.id } })).toBe(0);
  });

  // Holding the token is enough to ACCEPT, but declining is the addressee
  // refusing — the address is read from the caller, never passed in.
  it("refuses a token holder who is not the addressee", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("target");
    const stranger = await makeUser("stranger");
    const created = await invite(owner, owner.boardId, { role: "viewer", email: target.email });

    expect(
      (
        await client.post(
          "/api/v1/invites/decline",
          { token: created.token },
          { token: stranger.token },
        )
      ).status,
    ).toBe(404);
    expect(await prisma.board_invites.count({ where: { id: created.id } })).toBe(1);
  });

  it("refuses declining a link invite, which has no addressee", async () => {
    const owner = await makeUser("owner");
    const guest = await makeUser("guest");
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    expect(
      (await client.post("/api/v1/invites/decline", { token: created.token }, { token: guest.token }))
        .status,
    ).toBe(404);
  });
});

describe("GET /invites/mine", () => {
  it("lists invites addressed to the caller, without a token", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("target");

    await invite(owner, owner.boardId, { role: "editor", email: target.email });

    const response = await client.get<Record<string, unknown>[]>("/api/v1/invites/mine", {
      token: target.token,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).not.toHaveProperty("token");
    expect(response.body[0]).not.toHaveProperty("token_hash");
    expect(response.body[0]!.board_id).toBe(owner.boardId);
  });

  it("does not list someone else's invites", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("target");
    const nosy = await makeUser("nosy");

    await invite(owner, owner.boardId, { role: "viewer", email: target.email });

    const response = await client.get<unknown[]>("/api/v1/invites/mine", { token: nosy.token });

    expect(response.body).toHaveLength(0);
  });

  it("omits link invites, which are addressed to nobody", async () => {
    const owner = await makeUser("owner");
    const guest = await makeUser("guest");

    await invite(owner, owner.boardId, { role: "viewer" });

    expect((await client.get<unknown[]>("/api/v1/invites/mine", { token: guest.token })).body)
      .toHaveLength(0);
  });

  it("omits an invite to a board the caller already joined", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("target");

    await invite(owner, owner.boardId, { role: "viewer", email: target.email });
    await addMember(owner.boardId, target, "editor", owner.id);

    expect((await client.get<unknown[]>("/api/v1/invites/mine", { token: target.token })).body)
      .toHaveLength(0);
  });
});

describe("DELETE /invites/:inviteId", () => {
  it("lets an admin revoke", async () => {
    const owner = await makeUser("owner");
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    expect(
      (await client.del(`/api/v1/invites/${created.id}`, undefined, { token: owner.token })).status,
    ).toBe(204);
    expect(await prisma.board_invites.count({ where: { id: created.id } })).toBe(0);
  });

  it("answers 404 for a non-member of the invite's board", async () => {
    const owner = await makeUser("owner");
    const outsider = await makeUser("outsider");
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    const foreign = await client.del(`/api/v1/invites/${created.id}`, undefined, {
      token: outsider.token,
    });
    const absent = await client.del(`/api/v1/invites/${randomUUID()}`, undefined, {
      token: outsider.token,
    });

    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).toBe(JSON.stringify(absent.body));
    expect(await prisma.board_invites.count({ where: { id: created.id } })).toBe(1);
  });

  it("refuses an editor on the board with 403", async () => {
    const owner = await makeUser("owner");
    const editor = await makeUser("editor");

    await addMember(owner.boardId, editor, "editor", owner.id);

    const created = await invite(owner, owner.boardId, { role: "viewer" });

    expect(
      (await client.del(`/api/v1/invites/${created.id}`, undefined, { token: editor.token })).status,
    ).toBe(403);
  });

  it("refuses revoking an invitation that was already accepted", async () => {
    const owner = await makeUser("owner");
    const guest = await makeUser("guest");
    const created = await invite(owner, owner.boardId, { role: "viewer" });

    await client.post("/api/v1/invites/accept", { token: created.token }, { token: guest.token });

    expect(
      (await client.del(`/api/v1/invites/${created.id}`, undefined, { token: owner.token })).status,
    ).toBe(409);
  });
});

describe("GET /boards/:boardId/invitees", () => {
  it("returns nothing below two characters", async () => {
    const owner = await makeUser("owner");

    await makeUser("searchable");

    for (const q of ["", "a"]) {
      const response = await client.get<unknown[]>(
        `/api/v1/boards/${owner.boardId}/invitees?q=${q}`,
        { token: owner.token },
      );

      expect(response.status).toBe(200);
      expect(response.body, `q=${q}`).toHaveLength(0);
    }
  });

  it("finds a registered user by a fragment of their email", async () => {
    const owner = await makeUser("owner");
    const target = await makeUser("findme");

    const response = await client.get<{ id: string }[]>(
      `/api/v1/boards/${owner.boardId}/invitees?q=findme`,
      { token: owner.token },
    );

    expect(response.body.map((r) => r.id)).toContain(target.id);
  });

  it("never offers the caller, an existing member, or someone already invited", async () => {
    const owner = await makeUser("findme");
    const member = await makeUser("findme2");
    const invited = await makeUser("findme3");

    await addMember(owner.boardId, member, "viewer", owner.id);
    await invite(owner, owner.boardId, { role: "viewer", email: invited.email });

    const response = await client.get<{ id: string }[]>(
      `/api/v1/boards/${owner.boardId}/invitees?q=findme`,
      { token: owner.token },
    );

    const ids = response.body.map((r) => r.id);

    expect(ids).not.toContain(owner.id);
    expect(ids).not.toContain(member.id);
    expect(ids).not.toContain(invited.id);
  });

  it("refuses an editor, who has no business enumerating people", async () => {
    const owner = await makeUser("owner");
    const editor = await makeUser("editor");

    await addMember(owner.boardId, editor, "editor", owner.id);

    expect(
      (
        await client.get(`/api/v1/boards/${owner.boardId}/invitees?q=ab`, {
          token: editor.token,
        })
      ).status,
    ).toBe(403);
  });
});

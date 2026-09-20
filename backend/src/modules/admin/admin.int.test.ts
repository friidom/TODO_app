import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

let client: TestClient;

async function makeSuperadmin(name: string): Promise<TestUser> {
  const user = await makeUser(name);

  // By SQL, because M34 ships no endpoint that grants this and the test should
  // not pretend otherwise.
  await prisma.users.update({ where: { id: user.id }, data: { org_role: "superadmin" } });

  return user;
}

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(resetDatabase);

afterAll(async () => {
  await client.close();
  await disconnect();
});

describe("the /admin gate", () => {
  it("answers 401 with no token", async () => {
    expect((await client.get("/api/v1/admin/ping")).status).toBe(401);
  });

  // 404 and not 403 is the whole point: a 403 tells anyone who probes that
  // /admin exists and is worth attacking.
  it("answers 404 to an ordinary signed-in user", async () => {
    const user = await makeUser("ordinary");
    const response = await client.get("/api/v1/admin/ping", { token: user.token });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: "not_found", message: "Not found." } });
  });

  it("answers the same 404 for a route that does not exist", async () => {
    const admin = await makeSuperadmin("root");
    const real = await client.get("/api/v1/admin/nothing-here", { token: admin.token });
    const denied = await client.get("/api/v1/admin/ping", { token: (await makeUser("nobody")).token });

    expect(real.status).toBe(denied.status);
  });

  it("answers 200 to a superadmin", async () => {
    const admin = await makeSuperadmin("root");
    const response = await client.get("/api/v1/admin/ping", { token: admin.token });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("answers 404 once the role is taken away, without waiting for the token to expire", async () => {
    const admin = await makeSuperadmin("root");

    expect((await client.get("/api/v1/admin/ping", { token: admin.token })).status).toBe(200);

    await prisma.users.update({ where: { id: admin.id }, data: { org_role: "member" } });

    // Same token, still unexpired. This is what D-2 buys by reading the role
    // per request instead of baking it into the access token.
    expect((await client.get("/api/v1/admin/ping", { token: admin.token })).status).toBe(404);
  });

  it("answers 404 to a deactivated superadmin", async () => {
    const admin = await makeSuperadmin("root");

    await prisma.users.update({ where: { id: admin.id }, data: { deactivated_at: new Date() } });

    expect((await client.get("/api/v1/admin/ping", { token: admin.token })).status).toBe(404);
  });
});

describe("the global role does not touch board authorization", () => {
  // §10.7 rule 1, as an assertion rather than an intention: elevated roles
  // widen read, never write. A superadmin is a stranger to a board they are
  // not a member of, and gets a stranger's 404.
  it("leaves a superadmin unable to read or write a board they are not a member of", async () => {
    const admin = await makeSuperadmin("root");
    const stranger = await makeUser("stranger");

    const read = await client.get(`/api/v1/boards/${stranger.boardId}`, { token: admin.token });
    const write = await client.patch(
      `/api/v1/boards/${stranger.boardId}`,
      { title: "Taken over" },
      { token: admin.token },
    );

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);

    const board = await prisma.boards.findUniqueOrThrow({
      where: { id: stranger.boardId },
      select: { title: true },
    });

    expect(board.title).not.toBe("Taken over");
  });
});

describe("GET /auth/me", () => {
  it("tells a caller their own org role", async () => {
    const user = await makeUser("ordinary");
    const admin = await makeSuperadmin("root");

    const ordinary = await client.get<{ user: { org_role: string } }>("/api/v1/auth/me", {
      token: user.token,
    });
    const elevated = await client.get<{ user: { org_role: string } }>("/api/v1/auth/me", {
      token: admin.token,
    });

    expect(ordinary.body.user.org_role).toBe("member");
    expect(elevated.body.user.org_role).toBe("superadmin");
  });
});

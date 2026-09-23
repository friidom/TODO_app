import express, { Router } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../db/prisma.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { boardAccess, requireBoard } from "../middleware/boardAccess.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { disconnect, resetDatabase } from "./db.js";
import { makeUser } from "./fixtures.js";
import { startTestServer, type TestClient } from "./httpClient.js";

let client: TestClient;

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(resetDatabase);

afterAll(async () => {
  await client.close();
  await disconnect();
});

describe("the harness itself", () => {
  it("talks to the real app, not a stand-in", async () => {
    const health = await client.get<{ status: string; database: string }>("/health");

    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok", database: "up" });
  });

  it("routes through /api/v1", async () => {
    const root = await client.get("/api/v1");

    expect(root.status).toBe(200);
    expect(root.body).toEqual({ version: "v1", status: "ok" });
  });

  it("gets the real 404 shape for an unknown path", async () => {
    const missing = await client.get<{ error: { code: string } }>("/api/v1/nope");

    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("not_found");
  });

  it("is connected to a database whose name ends in _test", async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`select current_database() as name`;

    expect(rows[0]?.name).toMatch(/_test$/);
  });
});

describe("resetDatabase", () => {
  it("empties users and everything that cascades from them", async () => {
    const user = await makeUser("cascade");

    await expect(prisma.boards.count({ where: { id: user.boardId } })).resolves.toBe(1);
    await expect(prisma.columns.count({ where: { board_id: user.boardId } })).resolves.toBe(4);
    await expect(
      prisma.board_members.count({ where: { board_id: user.boardId } }),
    ).resolves.toBe(1);

    await resetDatabase();

    for (const count of await Promise.all([
      prisma.users.count(),
      prisma.profiles.count(),
      prisma.boards.count(),
      prisma.columns.count(),
      prisma.board_members.count(),
      prisma.spaces.count(),
      prisma.activities.count(),
      // Both cascade from users (0023). Listed here so a cascade that stops
      // working fails in the harness rather than as a stray row in a later
      // suite, which is what §21.11 and §21.12 both were.
      prisma.oauth_accounts.count(),
      prisma.oauth_link_tokens.count(),
    ])) {
      expect(count).toBe(0);
    }
  });

  it("leaves each test a database the previous one did not fill", async () => {
    await expect(prisma.users.count()).resolves.toBe(0);
  });
});

describe("fixtures", () => {
  it("provisions a real account, not a bare row", async () => {
    const user = await makeUser("alice");
    const me = await client.get<{ user: { id: string; profile: { username: string } } }>(
      "/api/v1/auth/me",
      { token: user.token },
    );

    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
    expect(me.body.user.profile.username).toBe(user.username);
  });

  it("gives two users separate boards", async () => {
    const [alice, mallory] = await Promise.all([makeUser("alice"), makeUser("mallory")]);

    expect(alice.boardId).not.toBe(mallory.boardId);
  });
});

// CONVENTIONS.md states that a nested router without mergeParams leaves
// req.params.boardId undefined, so boardAccess finds nothing to resolve and
// answers 500. routes/index.ts will mount exactly this shape in B7-A1; this
// pins the claim before anything depends on it.
describe("nested routers and mergeParams", () => {
  async function serve(mergeParams: boolean): Promise<TestClient> {
    const child = Router({ mergeParams });

    child.get("/", requireAuth, boardAccess(), (req, res) => {
      res.json({ board: requireBoard(req) });
    });

    const instance = express();

    instance.use(express.json());
    instance.use("/boards/:boardId", child);
    instance.use(notFoundHandler);
    instance.use(errorHandler);

    return startTestServer(instance);
  }

  it("resolves :boardId in a child router when mergeParams is on", async () => {
    const user = await makeUser("nested");
    const server = await serve(true);

    try {
      const response = await server.get<{ board: { id: string; role: string } }>(
        `/boards/${user.boardId}`,
        { token: user.token },
      );

      expect(response.status).toBe(200);
      expect(response.body.board).toEqual({ id: user.boardId, role: "owner" });
    } finally {
      await server.close();
    }
  });

  it("answers 500, not 404 or a silent pass, without it", async () => {
    const user = await makeUser("nested");
    const server = await serve(false);

    try {
      const response = await server.get<{ error: { code: string } }>(`/boards/${user.boardId}`, {
        token: user.token,
      });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe("internal");
    } finally {
      await server.close();
    }
  });
});

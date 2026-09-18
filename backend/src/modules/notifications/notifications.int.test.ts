import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser, type TestUser } from "../../testing/fixtures.js";
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

interface Notification {
  id: string;
  user_id: string;
  type: string;
  read_at: string | null;
  payload: unknown;
}

// notifications is trigger-written, so a fixture writes rows directly: there is
// no API path that creates one, and that is the point.
async function notify(user: TestUser, count: number): Promise<string[]> {
  const ids: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = await prisma.notifications.create({
      data: {
        user_id: user.id,
        type: "assigned",
        board_id: user.boardId,
        entity_type: "todo",
        payload: { title: `item ${index}` },
      },
      select: { id: true },
    });

    ids.push(row.id);
  }

  return ids;
}

describe("GET /notifications", () => {
  it("needs a token", async () => {
    expect((await client.get("/api/v1/notifications")).status).toBe(401);
  });

  it("returns only the caller's own inbox", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];

    await notify(alice, 2);
    await notify(mallory, 3);

    const response = await client.get<Notification[]>("/api/v1/notifications", {
      token: alice.token,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body.every((n) => n.user_id === alice.id)).toBe(true);
  });

  it("returns newest first", async () => {
    const alice = await makeUser("alice");

    await notify(alice, 3);

    const response = await client.get<Notification[]>("/api/v1/notifications", {
      token: alice.token,
    });
    const created = await prisma.notifications.findMany({
      where: { user_id: alice.id },
      select: { id: true, created_at: true },
    });
    const at = new Map(created.map((c) => [c.id, c.created_at.getTime()]));
    const ordered = response.body.map((n) => at.get(n.id)!);

    expect(ordered).toEqual([...ordered].sort((a, b) => b - a));
  });

  it("caps the page and accepts a smaller limit", async () => {
    const alice = await makeUser("alice");

    await notify(alice, 5);

    const response = await client.get<Notification[]>("/api/v1/notifications?limit=2", {
      token: alice.token,
    });

    expect(response.body).toHaveLength(2);
  });

  it("rejects an out-of-range limit", async () => {
    const alice = await makeUser("alice");

    for (const limit of ["0", "-1", "100000", "abc"]) {
      const response = await client.get(`/api/v1/notifications?limit=${limit}`, {
        token: alice.token,
      });

      expect(response.status, limit).toBe(400);
    }
  });
});

describe("GET /notifications/unread-count", () => {
  it("counts only the caller's unread rows", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const mine = await notify(alice, 3);

    await notify(mallory, 4);
    await prisma.notifications.update({
      where: { id: mine[0]! },
      data: { read_at: new Date() },
    });

    const response = await client.get<{ count: number }>("/api/v1/notifications/unread-count", {
      token: alice.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
  });

  it("is not shadowed by the list route's own path", async () => {
    const alice = await makeUser("alice");
    const response = await client.get<{ count: number }>("/api/v1/notifications/unread-count", {
      token: alice.token,
    });

    expect(response.body).toEqual({ count: 0 });
  });
});

describe("POST /notifications/read", () => {
  it("marks only the ids given, and only the caller's", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const mine = await notify(alice, 3);
    const theirs = await notify(mallory, 2);

    const response = await client.post<{ marked: number }>(
      "/api/v1/notifications/read",
      { ids: [mine[0]!, theirs[0]!] },
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.marked).toBe(1);

    expect(
      await prisma.notifications.count({ where: { user_id: alice.id, read_at: null } }),
    ).toBe(2);
    expect(
      await prisma.notifications.count({ where: { user_id: mallory.id, read_at: null } }),
    ).toBe(2);
  });

  it("cannot mark someone else's notification, even alone", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const theirs = await notify(mallory, 1);

    const response = await client.post<{ marked: number }>(
      "/api/v1/notifications/read",
      { ids: theirs },
      { token: alice.token },
    );

    expect(response.body.marked).toBe(0);
    expect(
      await prisma.notifications.findUniqueOrThrow({
        where: { id: theirs[0]! },
        select: { read_at: true },
      }),
    ).toEqual({ read_at: null });
  });

  it("rejects an empty or malformed id list", async () => {
    const alice = await makeUser("alice");

    for (const body of [{ ids: [] }, { ids: ["not-a-uuid"] }, {}]) {
      const response = await client.post("/api/v1/notifications/read", body, {
        token: alice.token,
      });

      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("POST /notifications/read-all", () => {
  // §18.2's named bug. The old client relied on RLS and its UPDATE carried no
  // user predicate at all, so a port that forgets one marks every inbox in the
  // database read.
  it("AFFECTS ONLY THE CALLER", async () => {
    const [alice, mallory, carol] = [
      await makeUser("alice"),
      await makeUser("mallory"),
      await makeUser("carol"),
    ];

    await notify(alice, 2);
    await notify(mallory, 3);
    await notify(carol, 1);

    const response = await client.post<{ marked: number }>(
      "/api/v1/notifications/read-all",
      undefined,
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.marked).toBe(2);

    expect(
      await prisma.notifications.count({ where: { user_id: alice.id, read_at: null } }),
    ).toBe(0);
    expect(
      await prisma.notifications.count({ where: { user_id: mallory.id, read_at: null } }),
    ).toBe(3);
    expect(
      await prisma.notifications.count({ where: { user_id: carol.id, read_at: null } }),
    ).toBe(1);
  });

  it("leaves an already-read row's timestamp alone", async () => {
    const alice = await makeUser("alice");
    const ids = await notify(alice, 2);
    const earlier = new Date(Date.now() - 60_000);

    await prisma.notifications.update({ where: { id: ids[0]! }, data: { read_at: earlier } });

    await client.post("/api/v1/notifications/read-all", undefined, { token: alice.token });

    const row = await prisma.notifications.findUniqueOrThrow({
      where: { id: ids[0]! },
      select: { read_at: true },
    });

    expect(row.read_at?.getTime()).toBe(earlier.getTime());
  });

  it("needs a token", async () => {
    expect((await client.post("/api/v1/notifications/read-all")).status).toBe(401);
  });
});

describe("there is no write path onto notifications", () => {
  it("does not expose a create endpoint", async () => {
    const alice = await makeUser("alice");
    const response = await client.post(
      "/api/v1/notifications",
      { user_id: alice.id, type: "assigned" },
      { token: alice.token },
    );

    expect(response.status).toBe(404);
    expect(await prisma.notifications.count()).toBe(0);
  });

  it("cannot rewrite any column but read_at", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const ids = await notify(alice, 1);

    const response = await client.post(
      "/api/v1/notifications/read",
      { ids, user_id: mallory.id, type: "invite" },
      { token: alice.token },
    );

    expect(response.status).toBe(200);

    const row = await prisma.notifications.findUniqueOrThrow({
      where: { id: ids[0]! },
      select: { user_id: true, type: true },
    });

    expect(row).toEqual({ user_id: alice.id, type: "assigned" });
  });
});

describe("the assignment trigger", () => {
  it("notifies the assignee, stamped with the acting user", async () => {
    const owner = await makeUser("owner");
    const assignee = await makeUser("assignee");
    const { addMember } = await import("../../testing/fixtures.js");

    await addMember(owner.boardId, assignee, "editor", owner.id);

    const column = await prisma.columns.findFirstOrThrow({
      where: { board_id: owner.boardId },
      select: { id: true },
    });

    await client.post(
      `/api/v1/boards/${owner.boardId}/todos`,
      { title: "Yours", column_id: column.id, assignee_id: assignee.id },
      { token: owner.token },
    );

    const response = await client.get<Notification[]>("/api/v1/notifications", {
      token: assignee.token,
    });

    expect(response.body).toHaveLength(1);
    expect(response.body[0]!.type).toBe("assigned");
  });

  it("does not notify someone assigning work to themselves", async () => {
    const owner = await makeUser("owner");
    const column = await prisma.columns.findFirstOrThrow({
      where: { board_id: owner.boardId },
      select: { id: true },
    });

    await client.post(
      `/api/v1/boards/${owner.boardId}/todos`,
      { title: "Mine", column_id: column.id, assignee_id: owner.id },
      { token: owner.token },
    );

    expect(await prisma.notifications.count({ where: { user_id: owner.id } })).toBe(0);
  });
});

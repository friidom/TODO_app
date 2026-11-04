import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser } from "../../testing/fixtures.js";
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

function payloads(todoId: string, action: string) {
  return prisma.activities
    .findMany({ where: { entity_id: todoId, action }, orderBy: { created_at: "asc" } })
    .then((rows) => rows.map((row) => row.payload as Record<string, unknown>));
}

describe("card history (migration 0043)", () => {
  it("records a move between sprints, naming both", async () => {
    const owner = await makeUser("owner");
    const todo = await client.post<{ id: string }>(
      `/api/v1/boards/${owner.boardId}/todos`,
      { title: "Card" },
      { token: owner.token },
    );
    const sprint = await client.post<{ id: string }>(
      `/api/v1/boards/${owner.boardId}/sprints`,
      { name: "Sprint 7" },
      { token: owner.token },
    );

    await client.patch(
      `/api/v1/boards/${owner.boardId}/todos/${todo.body.id}`,
      { sprint_id: sprint.body.id },
      { token: owner.token },
    );
    await client.patch(
      `/api/v1/boards/${owner.boardId}/todos/${todo.body.id}`,
      { sprint_id: null },
      { token: owner.token },
    );

    expect(await payloads(todo.body.id, "sprint_changed")).toEqual([
      expect.objectContaining({ from: null, to: sprint.body.id, from_name: null, to_name: "Sprint 7" }),
      expect.objectContaining({ from: sprint.body.id, to: null, from_name: "Sprint 7", to_name: null }),
    ]);
  });

  it("records a start date being set and cleared", async () => {
    const owner = await makeUser("owner");
    const todo = await client.post<{ id: string }>(
      `/api/v1/boards/${owner.boardId}/todos`,
      { title: "Card" },
      { token: owner.token },
    );
    const url = `/api/v1/boards/${owner.boardId}/todos/${todo.body.id}`;

    await client.patch(url, { start_date: "2026-11-02T00:00:00.000Z" }, { token: owner.token });
    await client.patch(url, { start_date: null }, { token: owner.token });

    expect(await payloads(todo.body.id, "start_changed")).toEqual([
      expect.objectContaining({ from: null, to: "2026-11-02" }),
      expect.objectContaining({ from: "2026-11-02", to: null }),
    ]);
  });
});

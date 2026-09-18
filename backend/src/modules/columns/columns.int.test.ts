import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { RANK_GAP, byRank } from "../../lib/rank.js";
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

interface Column {
  id: string;
  board_id: string;
  title: string | null;
  position: number | null;
  rank: number | null;
  category: string | null;
  min_limit: number | null;
  max_limit: number | null;
}

function columnsUrl(boardId: string, suffix = ""): string {
  return `/api/v1/boards/${boardId}/columns${suffix}`;
}

async function setup(role?: "editor" | "viewer") {
  const owner = await makeUser("owner");

  if (role === undefined) return { owner, actor: owner, boardId: owner.boardId };

  const member = await makeUser(role);

  await addMember(owner.boardId, member, role, owner.id);

  return { owner, actor: member, boardId: owner.boardId };
}

async function addTodo(actor: TestUser, boardId: string, columnId: string, title: string) {
  const response = await client.post<{ id: string; rank: number }>(
    `/api/v1/boards/${boardId}/todos`,
    { title, column_id: columnId },
    { token: actor.token },
  );

  return response.body;
}

describe("GET /boards/:boardId/columns", () => {
  it("returns the four columns provisioning created, in rank order", async () => {
    const { actor, boardId } = await setup();
    const response = await client.get<Column[]>(columnsUrl(boardId), { token: actor.token });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(4);
    expect(response.body.map((c) => c.title)).toEqual([
      "To Do",
      "In Progress",
      "In Review",
      "Done",
    ]);
  });

  it("serialises position as a JSON number", async () => {
    const { actor, boardId } = await setup();
    const response = await client.get<Column[]>(columnsUrl(boardId), { token: actor.token });

    expect(typeof response.body[0]!.position).toBe("number");
  });

  it("answers 404 for a non-member", async () => {
    const { boardId } = await setup();
    const outsider = await makeUser("outsider");

    expect((await client.get(columnsUrl(boardId), { token: outsider.token })).status).toBe(404);
  });
});

describe("POST /boards/:boardId/columns", () => {
  it("appends after the board's last column", async () => {
    const { actor, boardId } = await setup();
    const before = await client.get<Column[]>(columnsUrl(boardId), { token: actor.token });
    const lastRank = Math.max(...before.body.map((c) => c.rank ?? 0));

    const created = await client.post<Column>(
      columnsUrl(boardId),
      { title: "Blocked", category: "in_progress" },
      { token: actor.token },
    );

    expect(created.status).toBe(201);
    expect(created.body.rank!).toBeGreaterThan(lastRank);
  });

  it("refuses a viewer and allows an editor", async () => {
    const viewer = await setup("viewer");

    expect(
      (
        await client.post(
          columnsUrl(viewer.boardId),
          { title: "x", category: "todo" },
          { token: viewer.actor.token },
        )
      ).status,
    ).toBe(403);

    const editor = await setup("editor");

    expect(
      (
        await client.post(
          columnsUrl(editor.boardId),
          { title: "x", category: "todo" },
          { token: editor.actor.token },
        )
      ).status,
    ).toBe(201);
  });

  it("rejects a category outside the CHECK", async () => {
    const { actor, boardId } = await setup();

    expect(
      (
        await client.post(
          columnsUrl(boardId),
          { title: "x", category: "archived" },
          { token: actor.token },
        )
      ).status,
    ).toBe(400);
  });
});

describe("PATCH /columns/:columnId", () => {
  it("updates the title and the advisory limits", async () => {
    const { actor, boardId } = await setup();
    const [column] = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;

    const response = await client.patch<Column>(
      `/api/v1/columns/${column!.id}`,
      { title: "Renamed", min_limit: 1, max_limit: 5 },
      { token: actor.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("Renamed");
    expect(response.body.min_limit).toBe(1);
    expect(response.body.max_limit).toBe(5);
  });

  it("rejects limits the CHECK refuses, as a 400", async () => {
    const { actor, boardId } = await setup();
    const [column] = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;

    for (const body of [{ min_limit: -1 }, { min_limit: 9, max_limit: 2 }]) {
      const response = await client.patch(`/api/v1/columns/${column!.id}`, body, {
        token: actor.token,
      });

      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("cannot reach a column on another board", async () => {
    const { actor } = await setup();
    const other = await makeUser("other");
    const theirColumn = await prisma.columns.findFirstOrThrow({
      where: { board_id: other.boardId },
      select: { id: true },
    });

    const response = await client.patch(
      `/api/v1/columns/${theirColumn.id}`,
      { title: "Stolen" },
      { token: actor.token },
    );

    expect(response.status).toBe(404);
  });
});

describe("POST /columns/:columnId/move", () => {
  it("writes one row and leaves the others alone", async () => {
    const { actor, boardId } = await setup();
    const columns = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;
    const [first, second] = columns;

    const response = await client.post(
      `/api/v1/columns/${first!.id}/move`,
      { rank: 5000 },
      { token: actor.token },
    );

    expect(response.status).toBe(204);

    const after = await prisma.columns.findMany({
      where: { board_id: boardId },
      select: { id: true, rank: true },
    });

    expect(after.find((c) => c.id === first!.id)!.rank).toBe(5000);
    expect(after.find((c) => c.id === second!.id)!.rank).toBe(second!.rank);
  });
});

describe("DELETE /columns/:columnId", () => {
  it("rehomes the cards and then deletes the column, in one transaction", async () => {
    const { actor, boardId } = await setup();
    const columns = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;
    const source = columns[0]!;
    const destination = columns[1]!;

    await addTodo(actor, boardId, source.id, "a");
    await addTodo(actor, boardId, source.id, "b");
    await addTodo(actor, boardId, destination.id, "kept");

    const response = await client.del(
      `/api/v1/columns/${source.id}`,
      { moveToColumnId: destination.id },
      { token: actor.token },
    );

    expect(response.status).toBe(204);
    expect(await prisma.columns.count({ where: { id: source.id } })).toBe(0);
    expect(await prisma.todos.count({ where: { column_id: destination.id } })).toBe(3);
  });

  // The SQL wrote only position, three days before ranks existed, so its
  // "append" was invisible: every surface sorts by rank ?? position * RANK_GAP.
  it("appends the rehomed cards AFTER the destination's own, by rank", async () => {
    const { actor, boardId } = await setup();
    const columns = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;
    const source = columns[0]!;
    const destination = columns[1]!;

    await addTodo(actor, boardId, source.id, "moved-1");
    await addTodo(actor, boardId, source.id, "moved-2");
    await addTodo(actor, boardId, destination.id, "stayed");

    await client.del(
      `/api/v1/columns/${source.id}`,
      { moveToColumnId: destination.id },
      { token: actor.token },
    );

    const rows = await prisma.todos.findMany({
      where: { column_id: destination.id },
      select: { title: true, rank: true, position: true },
    });

    const ordered = rows
      .map((r) => ({ title: r.title, rank: r.rank, position: Number(r.position) }))
      .sort(byRank);

    expect(ordered.map((r) => r.title)).toEqual(["stayed", "moved-1", "moved-2"]);
  });

  it("refuses a destination on a different board", async () => {
    const { actor, boardId } = await setup();
    const other = await makeUser("other");
    const columns = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;
    const theirColumn = await prisma.columns.findFirstOrThrow({
      where: { board_id: other.boardId },
      select: { id: true },
    });

    const response = await client.del(
      `/api/v1/columns/${columns[0]!.id}`,
      { moveToColumnId: theirColumn.id },
      { token: actor.token },
    );

    expect(response.status).toBe(404);
    expect(await prisma.columns.count({ where: { id: columns[0]!.id } })).toBe(1);
  });

  it("refuses a destination equal to the source", async () => {
    const { actor, boardId } = await setup();
    const columns = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;

    const response = await client.del(
      `/api/v1/columns/${columns[0]!.id}`,
      { moveToColumnId: columns[0]!.id },
      { token: actor.token },
    );

    expect(response.status).toBe(400);
    expect(await prisma.columns.count({ where: { id: columns[0]!.id } })).toBe(1);
  });

  it("requires a destination at all", async () => {
    const { actor, boardId } = await setup();
    const columns = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;

    expect(
      (await client.del(`/api/v1/columns/${columns[0]!.id}`, {}, { token: actor.token })).status,
    ).toBe(400);
  });

  it("refuses a viewer, leaving the column and its cards intact", async () => {
    const { owner, actor, boardId } = await setup("viewer");
    const columns = (await client.get<Column[]>(columnsUrl(boardId), { token: owner.token })).body;

    await addTodo(owner, boardId, columns[0]!.id, "a");

    const response = await client.del(
      `/api/v1/columns/${columns[0]!.id}`,
      { moveToColumnId: columns[1]!.id },
      { token: actor.token },
    );

    expect(response.status).toBe(403);
    expect(await prisma.columns.count({ where: { id: columns[0]!.id } })).toBe(1);
    expect(await prisma.todos.count({ where: { column_id: columns[0]!.id } })).toBe(1);
  });

  it("writes a moved activity per rehomed card, which is accepted noise", async () => {
    const { actor, boardId } = await setup();
    const columns = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;

    await addTodo(actor, boardId, columns[0]!.id, "a");
    await addTodo(actor, boardId, columns[0]!.id, "b");

    await prisma.activities.deleteMany({ where: { board_id: boardId } });

    await client.del(
      `/api/v1/columns/${columns[0]!.id}`,
      { moveToColumnId: columns[1]!.id },
      { token: actor.token },
    );

    const moved = await prisma.activities.count({ where: { board_id: boardId, action: "moved" } });

    expect(moved).toBe(2);
  });
});

describe("rebalancing", () => {
  it("respaces the board's columns to multiples of RANK_GAP without reordering", async () => {
    const { actor, boardId } = await setup();
    const before = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;

    const response = await client.post<{ rebalanced: number }>(
      columnsUrl(boardId, "/rebalance"),
      undefined,
      { token: actor.token },
    );

    expect(response.status).toBe(200);

    const after = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;

    expect(after.map((c) => c.title)).toEqual(before.map((c) => c.title));
    expect(after.map((c) => c.rank)).toEqual([1, 2, 3, 4].map((n) => n * RANK_GAP));
  });

  it("respaces one column's cards without reordering them", async () => {
    const { actor, boardId } = await setup();
    const columns = (await client.get<Column[]>(columnsUrl(boardId), { token: actor.token })).body;
    const columnId = columns[0]!.id;

    for (const title of ["a", "b", "c"]) await addTodo(actor, boardId, columnId, title);

    // Squeeze them into a gap the way repeated midpoint drops would.
    const rows = await prisma.todos.findMany({
      where: { column_id: columnId },
      orderBy: { rank: "asc" },
      select: { id: true },
    });

    await prisma.todos.update({ where: { id: rows[1]!.id }, data: { rank: 1024.0001 } });
    await prisma.todos.update({ where: { id: rows[2]!.id }, data: { rank: 1024.0002 } });

    const response = await client.post<{ rebalanced: number }>(
      columnsUrl(boardId, `/${columnId}/rebalance`),
      undefined,
      { token: actor.token },
    );

    expect(response.status).toBe(200);

    const after = await prisma.todos.findMany({
      where: { column_id: columnId },
      orderBy: { rank: "asc" },
      select: { id: true, rank: true },
    });

    expect(after.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    expect(after.map((r) => r.rank)).toEqual([1, 2, 3].map((n) => n * RANK_GAP));
  });

  it("refuses a viewer", async () => {
    const { actor, boardId } = await setup("viewer");

    expect(
      (await client.post(columnsUrl(boardId, "/rebalance"), undefined, { token: actor.token }))
        .status,
    ).toBe(403);
  });

  // Both ids are in the path, so boardAccess resolves the column too and
  // requires the pair to name one board. The request never reaches the service.
  it("answers 404 for a column on another board", async () => {
    const { actor, boardId } = await setup();
    const other = await makeUser("other");
    const theirColumn = await prisma.columns.findFirstOrThrow({
      where: { board_id: other.boardId },
      select: { id: true },
    });

    const response = await client.post(
      columnsUrl(boardId, `/${theirColumn.id}/rebalance`),
      undefined,
      { token: actor.token },
    );

    expect(response.status).toBe(404);
    expect(
      await prisma.columns.findUniqueOrThrow({
        where: { id: theirColumn.id },
        select: { board_id: true },
      }),
    ).toEqual({ board_id: other.boardId });
  });

  // boardAccess runs before validate and gives a malformed child id the same
  // 404 a real id from another board gets, so neither is an existence oracle.
  it("answers 404 for a malformed column id", async () => {
    const { actor, boardId } = await setup();

    expect(
      (
        await client.post(columnsUrl(boardId, `/${randomUUID().slice(0, 8)}/rebalance`), undefined, {
          token: actor.token,
        })
      ).status,
    ).toBe(404);
  });
});

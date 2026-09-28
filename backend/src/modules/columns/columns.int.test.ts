import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { RANK_GAP } from "../../lib/rank.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, firstStatusOf, makeUser, type TestUser } from "../../testing/fixtures.js";
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

async function addTodo(actor: TestUser, boardId: string, statusId: string, title: string) {
  const response = await client.post<{ id: string; rank: number }>(
    `/api/v1/boards/${boardId}/todos`,
    { title, status_id: statusId },
    { token: actor.token },
  );

  return response.body;
}

describe("PATCH /columns/:columnId", () => {
  it("updates the advisory limits", async () => {
    const { actor, boardId } = await setup();
    const { column_id: columnId } = await firstStatusOf(boardId);

    const response = await client.patch<Column>(
      `/api/v1/columns/${columnId}`,
      { min_limit: 1, max_limit: 5 },
      { token: actor.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.min_limit).toBe(1);
    expect(response.body.max_limit).toBe(5);
    expect(typeof response.body.position).toBe("number");
  });

  it("allows an editor, and refuses a viewer", async () => {
    const editor = await setup("editor");
    const viewer = await setup("viewer");

    const editorColumn = (await firstStatusOf(editor.boardId)).column_id;
    const viewerColumn = (await firstStatusOf(viewer.boardId)).column_id;

    expect(
      (
        await client.patch(`/api/v1/columns/${editorColumn}`, { max_limit: 3 }, {
          token: editor.actor.token,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await client.patch(`/api/v1/columns/${viewerColumn}`, { max_limit: 3 }, {
          token: viewer.actor.token,
        })
      ).status,
    ).toBe(403);
  });

  // A title is the workflow's, so it is not a field this route knows: the body
  // is stripped to nothing and refused, and the title is untouched.
  it("no longer renames a column", async () => {
    const { actor, boardId } = await setup();
    const { column_id: columnId } = await firstStatusOf(boardId);

    const response = await client.patch(
      `/api/v1/columns/${columnId}`,
      { title: "Renamed" },
      { token: actor.token },
    );

    expect(response.status).toBe(400);
    expect(
      (await prisma.columns.findUniqueOrThrow({ where: { id: columnId } })).title,
    ).toBe("To Do");
  });

  it("rejects limits the CHECK refuses, as a 400", async () => {
    const { actor, boardId } = await setup();
    const { column_id: columnId } = await firstStatusOf(boardId);

    for (const body of [{ min_limit: -1 }, { min_limit: 9, max_limit: 2 }]) {
      const response = await client.patch(`/api/v1/columns/${columnId}`, body, {
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
      { max_limit: 1 },
      { token: actor.token },
    );

    expect(response.status).toBe(404);
  });
});

// Creating, renaming, reordering and deleting a column are workflow changes
// now (PUT /boards/:boardId/workflow), and the routes that did them are gone
// rather than left beside it as a second way in.
describe("the retired structural routes", () => {
  it("answer 404", async () => {
    const { actor, boardId } = await setup();
    const { column_id: columnId } = await firstStatusOf(boardId);
    const options = { token: actor.token };

    expect((await client.get(columnsUrl(boardId), options)).status).toBe(404);
    expect(
      (await client.post(columnsUrl(boardId), { title: "x", category: "todo" }, options)).status,
    ).toBe(404);
    expect((await client.post(columnsUrl(boardId, "/rebalance"), undefined, options)).status).toBe(
      404,
    );
    expect(
      (await client.post(`/api/v1/columns/${columnId}/move`, { rank: 1 }, options)).status,
    ).toBe(404);
    expect(
      (await client.del(`/api/v1/columns/${columnId}`, { moveToColumnId: columnId }, options))
        .status,
    ).toBe(404);
    expect(await prisma.columns.count({ where: { board_id: boardId } })).toBe(4);
  });
});

describe("rebalancing a column's cards", () => {
  it("respaces the cards of every status in the column without reordering them", async () => {
    const { actor, boardId } = await setup();
    const { id: statusId, column_id: columnId } = await firstStatusOf(boardId);

    for (const title of ["a", "b", "c"]) await addTodo(actor, boardId, statusId, title);

    // Squeeze them into a gap the way repeated midpoint drops would.
    const rows = await prisma.todos.findMany({
      where: { status_id: statusId },
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
      where: { status_id: statusId },
      orderBy: { rank: "asc" },
      select: { id: true, rank: true },
    });

    expect(after.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    expect(after.map((r) => r.rank)).toEqual([1, 2, 3].map((n) => n * RANK_GAP));
  });

  it("refuses a viewer", async () => {
    const { actor, boardId } = await setup("viewer");
    const { column_id: columnId } = await firstStatusOf(boardId);

    expect(
      (
        await client.post(columnsUrl(boardId, `/${columnId}/rebalance`), undefined, {
          token: actor.token,
        })
      ).status,
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

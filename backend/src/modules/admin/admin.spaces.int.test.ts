import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

let client: TestClient;
let admin: TestUser;
let dev: TestUser;
let spaceId: string;
let boardA: string;
let boardB: string;

const DAY = 86_400_000;

async function makeSuperadmin(name: string): Promise<TestUser> {
  const user = await makeUser(name);

  await prisma.users.update({ where: { id: user.id }, data: { org_role: "superadmin" } });

  return user;
}

async function columnOf(boardId: string, category: string): Promise<string> {
  const row = await prisma.columns.findFirstOrThrow({
    where: { board_id: boardId, category },
    select: { id: true },
  });

  return row.id;
}

async function card(board: string, category: string, extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  const column = await columnOf(board, category);

  const response = await client.patch(
    `/api/v1/boards/${board}/todos/${id}`,
    { title: "card", column_id: column, rank: Math.random() * 1000, ...extra },
    { token: admin.token },
  );

  expect(response.status).toBeLessThan(300);

  return id;
}

function backdate(
  id: string,
  days: { created?: number; started?: number | null; completed?: number | null },
) {
  const ago = (value: number): Date => new Date(Date.now() - value * DAY);

  return prisma.todos.update({
    where: { id },
    data: {
      ...(days.created !== undefined ? { created_at: ago(days.created) } : {}),
      ...(days.started !== undefined
        ? { started_at: days.started === null ? null : ago(days.started) }
        : {}),
      ...(days.completed !== undefined
        ? { completed_at: days.completed === null ? null : ago(days.completed) }
        : {}),
    },
  });
}

interface Space {
  id: string | null;
  title: string;
  boards: number;
  members: number;
  todos: number;
  open_todos: number;
  completed_todos: number;
  completed_points: number;
  comments: number;
  activities: number;
  median_cycle_days: number | null;
  last_activity_at: string | null;
}

interface SeriesPoint {
  bucket: string;
  created_todos: number;
  completed_todos: number;
  comments: number;
  activities: number;
}

function spaces(query = "?period=30d", token = admin.token) {
  return client.get<{ spaces: Space[] }>(`/api/v1/admin/spaces${query}`, { token });
}

function detail(id: string, query = "?period=30d", token = admin.token) {
  return client.get<{ space: Space; boards: { id: string }[]; series: SeriesPoint[] }>(
    `/api/v1/admin/spaces/${id}${query}`,
    { token },
  );
}

function named(body: { spaces: Space[] }, title: string): Space {
  const row = body.spaces.find((space) => space.title === title);

  if (row === undefined) throw new Error(`no space titled ${title}`);

  return row;
}

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(async () => {
  await resetDatabase();
  admin = await makeSuperadmin("root");
  dev = await makeUser("dev");

  const space = await prisma.spaces.findFirstOrThrow({
    where: { owner_id: admin.id },
    select: { id: true },
  });

  spaceId = space.id;
  boardA = admin.boardId;
  boardB = dev.boardId;
  await addMember(boardB, admin, "editor", dev.id);
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

describe("GET /admin/spaces", () => {
  it("is superadmin-only", async () => {
    const outsider = await makeUser("outsider");

    expect((await spaces("?period=30d", outsider.token)).status).toBe(404);
  });

  it("returns numbers, not strings", async () => {
    const { body } = await spaces();
    const row = body.spaces[0]!;

    expect(typeof row.boards).toBe("number");
    expect(typeof row.members).toBe("number");
    expect(typeof row.completed_points).toBe("number");
  });

  it("files every provisioned board into its owner's space", async () => {
    const { body } = await spaces();

    expect(body.spaces).toHaveLength(2);
    expect(body.spaces.every((space) => space.id !== null)).toBe(true);
  });

  it("keeps an unfiled board as its own bucket rather than dropping it", async () => {
    await prisma.boards.update({ where: { id: boardB }, data: { space_id: null } });

    const { body } = await spaces();
    const unfiled = named(body, "Unfiled");

    expect(unfiled.id).toBeNull();
    expect(unfiled.boards).toBe(1);
    expect(body.spaces.reduce((sum, space) => sum + space.boards, 0)).toBe(2);
  });

  it("rolls the board aggregates up into the space they are filed into", async () => {
    await prisma.boards.updateMany({
      where: { id: { in: [boardA, boardB] } },
      data: { space_id: spaceId },
    });

    const a = await card(boardA, "done", { assignee_id: admin.id, estimate: 3 });
    const b = await card(boardB, "done", { assignee_id: admin.id, estimate: 5 });

    await backdate(a, { created: 10, started: 8, completed: 6 });
    await backdate(b, { created: 10, started: 9, completed: 5 });

    const { body } = await spaces();
    const filed = body.spaces.find((space) => space.id === spaceId)!;

    expect(filed.boards).toBe(2);
    expect(filed.completed_todos).toBe(2);
    expect(filed.completed_points).toBeCloseTo(8, 5);
    expect(body.spaces.some((space) => space.title === "Unfiled")).toBe(false);
  });

  it("counts a person on two boards of one space once", async () => {
    await prisma.boards.updateMany({
      where: { id: { in: [boardA, boardB] } },
      data: { space_id: spaceId },
    });

    const { body } = await spaces();
    const filed = body.spaces.find((space) => space.id === spaceId)!;

    expect(filed.boards).toBe(2);
    expect(filed.members).toBe(2);
  });

  it("reports a null median cycle time when nothing in the space was timed", async () => {
    await prisma.boards.update({ where: { id: boardA }, data: { space_id: spaceId } });

    const untimed = await card(boardA, "done", { assignee_id: admin.id });

    await backdate(untimed, { created: 10, started: null, completed: 6 });

    const filed = (await spaces()).body.spaces.find((space) => space.id === spaceId)!;

    expect(filed.completed_todos).toBe(1);
    expect(filed.median_cycle_days).toBeNull();
  });
});

describe("GET /admin/spaces/:id", () => {
  beforeEach(async () => {
    await prisma.boards.update({ where: { id: boardA }, data: { space_id: spaceId } });
  });

  it("404s for a space that does not exist", async () => {
    expect((await detail(randomUUID())).status).toBe(404);
  });

  it("returns the space, its boards and a series scoped to it", async () => {
    const mine = await card(boardA, "done", { assignee_id: admin.id });
    const elsewhere = await card(boardB, "done", { assignee_id: admin.id });

    await backdate(mine, { created: 6, started: 5, completed: 4 });
    await backdate(elsewhere, { created: 6, started: 5, completed: 4 });

    const { body } = await detail(spaceId);

    expect(body.space.id).toBe(spaceId);
    expect(body.boards.map((board) => board.id)).toEqual([boardA]);
    expect(body.series.reduce((sum, point) => sum + point.completed_todos, 0)).toBe(1);
  });
});

describe("created_todos in the series", () => {
  it("counts creations per bucket alongside completions", async () => {
    const one = await card(boardA, "todo");
    const two = await card(boardA, "done", { assignee_id: admin.id });

    await backdate(one, { created: 3 });
    await backdate(two, { created: 3, started: 2, completed: 1 });

    const { body } = await client.get<{ series: SeriesPoint[] }>(
      "/api/v1/admin/overview?period=30d",
      { token: admin.token },
    );

    expect(body.series.reduce((sum, point) => sum + point.created_todos, 0)).toBe(2);
    expect(body.series.reduce((sum, point) => sum + point.completed_todos, 0)).toBe(1);
  });

  it("is a number in every bucket, zero-filled where nothing happened", async () => {
    const { body } = await client.get<{ series: SeriesPoint[] }>(
      "/api/v1/admin/overview?period=30d",
      { token: admin.token },
    );

    expect(body.series).toHaveLength(31);
    expect(body.series.every((point) => typeof point.created_todos === "number")).toBe(true);
    expect(body.series.every((point) => point.created_todos === 0)).toBe(true);
  });

  it("is scoped by board like every other series metric", async () => {
    await card(boardA, "todo");
    await card(boardB, "todo");

    const scoped = await client.get<{ series: SeriesPoint[] }>(
      `/api/v1/admin/boards/${boardA}?period=30d`,
      { token: admin.token },
    );

    expect(scoped.body.series.reduce((sum, point) => sum + point.created_todos, 0)).toBe(1);
  });
});

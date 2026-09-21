import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { pool } from "../../db/client.js";
import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

let client: TestClient;
let admin: TestUser;
let dev: TestUser;

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

async function card(
  board: string,
  category: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
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
): Promise<unknown> {
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

interface UserRow {
  id: string;
  username: string;
  completed_todos: number;
  completed_points: number;
  comments: number;
  activities: number;
  boards: number;
  median_cycle_days: number | null;
  cycle_n: number;
  performance: number | null;
}

interface DurationStats {
  median_days: number | null;
  p75_days: number | null;
  p90_days: number | null;
  n: number;
  unmeasured: number;
}

interface DetailBody {
  user: UserRow;
  cycle_time: DurationStats;
  lead_time: DurationStats;
  cycle_histogram: { from_days: number; to_days: number | null; count: number }[];
  board_share: {
    board_id: string;
    title: string | null;
    completed_todos: number;
    completed_points: number;
  }[];
  recent: {
    id: string;
    board_id: string;
    board_title: string | null;
    board_key: number | null;
    title: string | null;
    completed_at: string;
    estimate: number | null;
    cycle_days: number | null;
  }[];
}

function users(query = "?period=30d", token = admin.token) {
  return client.get<{ users: UserRow[] }>(`/api/v1/admin/users${query}`, { token });
}

function detail(id = admin.id, query = "?period=30d", token = admin.token) {
  return client.get<DetailBody>(`/api/v1/admin/users/${id}${query}`, { token });
}

function rowFor(body: { users: UserRow[] }, id: string): UserRow {
  const row = body.users.find((candidate) => candidate.id === id);

  if (row === undefined) throw new Error("user missing from the rollup");

  return row;
}

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(async () => {
  await resetDatabase();
  admin = await makeSuperadmin("root");
  dev = await makeUser("dev");
  boardA = admin.boardId;
  boardB = dev.boardId;
  await addMember(boardB, admin, "editor", dev.id);
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

describe("median cycle time on the rollup", () => {
  it("returns a number, not a string, for someone with timed work", async () => {
    const one = await card(boardA, "done", { assignee_id: admin.id });
    const two = await card(boardA, "done", { assignee_id: admin.id });

    await backdate(one, { created: 10, started: 9, completed: 8 }); // 1 day
    await backdate(two, { created: 10, started: 7, completed: 4 }); // 3 days

    const row = rowFor((await users()).body, admin.id);

    expect(typeof row.median_cycle_days).toBe("number");
    expect(row.median_cycle_days).toBeCloseTo(2, 5);
    expect(row.cycle_n).toBe(2);
  });

  it("is null, never zero, for someone whose completions were never timed", async () => {
    const id = await card(boardA, "done", { assignee_id: admin.id });

    await backdate(id, { created: 10, started: null, completed: 6 });

    const row = rowFor((await users()).body, admin.id);

    expect(row.median_cycle_days).toBeNull();
    expect(row.cycle_n).toBe(0);
    expect(row.completed_todos).toBe(1);
  });

  it("counts only the timed completions in cycle_n", async () => {
    const timed = await card(boardA, "done", { assignee_id: admin.id });
    const untimed = await card(boardA, "done", { assignee_id: admin.id });

    await backdate(timed, { created: 10, started: 8, completed: 6 });
    await backdate(untimed, { created: 10, started: null, completed: 5 });

    const row = rowFor((await users()).body, admin.id);

    expect(row.completed_todos).toBe(2);
    expect(row.cycle_n).toBe(1);
    expect(row.median_cycle_days).toBeCloseTo(2, 5);
  });
});

describe("the scope facets on the rollup", () => {
  beforeEach(async () => {
    const a = await card(boardA, "done", { assignee_id: admin.id, estimate: 3 });
    const b = await card(boardB, "done", { assignee_id: admin.id, estimate: 5 });

    await backdate(a, { created: 10, started: 8, completed: 6 });
    await backdate(b, { created: 10, started: 9, completed: 2 });
  });

  it("narrows the work metrics to one board", async () => {
    expect(rowFor((await users()).body, admin.id).completed_todos).toBe(2);

    const scoped = rowFor((await users(`?period=30d&board=${boardA}`)).body, admin.id);

    expect(scoped.completed_todos).toBe(1);
    expect(scoped.completed_points).toBeCloseTo(3, 5);
  });

  it("leaves 'boards contributed to' alone when a board is selected", async () => {
    const all = rowFor((await users()).body, admin.id);
    const scoped = rowFor((await users(`?period=30d&board=${boardA}`)).body, admin.id);

    expect(all.boards).toBe(2);
    expect(scoped.boards).toBe(2);
  });

  it("narrows to a space through the boards filed into it", async () => {
    const space = await prisma.spaces.findFirstOrThrow({
      where: { owner_id: admin.id },
      select: { id: true },
    });

    await prisma.boards.update({ where: { id: boardA }, data: { space_id: space.id } });

    const scoped = rowFor((await users(`?period=30d&space=${space.id}`)).body, admin.id);

    expect(scoped.completed_todos).toBe(1);
  });

  it("refuses a board that is not a uuid rather than ignoring it", async () => {
    expect((await users("?period=30d&board=nope")).status).toBe(400);
  });

  it("keeps every user in the list, scoped or not", async () => {
    const scoped = (await users(`?period=30d&board=${boardA}`)).body;

    expect(scoped.users.map((row) => row.id)).toContain(dev.id);
    expect(rowFor(scoped, dev.id).completed_todos).toBe(0);
  });
});

describe("the boards rollup", () => {
  it("carries a median cycle time, null when nothing on it was timed", async () => {
    const timed = await card(boardA, "done", { assignee_id: admin.id });

    await backdate(timed, { created: 10, started: 8, completed: 4 });

    const { body } = await client.get<{
      boards: { id: string; median_cycle_days: number | null }[];
    }>("/api/v1/admin/boards?period=30d", { token: admin.token });

    const a = body.boards.find((row) => row.id === boardA)!;
    const b = body.boards.find((row) => row.id === boardB)!;

    expect(a.median_cycle_days).toBeCloseTo(4, 5);
    expect(b.median_cycle_days).toBeNull();
  });

  it("narrows the list to one space", async () => {
    const space = await prisma.spaces.findFirstOrThrow({
      where: { owner_id: admin.id },
      select: { id: true },
    });

    await prisma.boards.update({ where: { id: boardA }, data: { space_id: space.id } });

    const { body } = await client.get<{ boards: { id: string }[] }>(
      `/api/v1/admin/boards?period=30d&space=${space.id}`,
      { token: admin.token },
    );

    expect(body.boards.map((row) => row.id)).toEqual([boardA]);
  });
});

describe("the developer drill-down", () => {
  it("is superadmin-only, like everything else under /admin", async () => {
    const outsider = await makeUser("outsider");

    expect((await detail(admin.id, "?period=30d", outsider.token)).status).toBe(404);
  });

  it("returns the durations, the histogram, the board split and the recent list", async () => {
    const a = await card(boardA, "done", { assignee_id: admin.id, estimate: 3 });
    const b = await card(boardB, "done", { assignee_id: admin.id, estimate: 5 });

    await backdate(a, { created: 10, started: 8, completed: 6 });
    await backdate(b, { created: 12, started: 9, completed: 5 });

    const { body } = await detail();

    expect(body.cycle_time.n).toBe(2);
    expect(body.cycle_time.median_days).toBeCloseTo(3, 5);
    expect(body.lead_time.median_days).toBeCloseTo(5.5, 5);
    expect(body.cycle_histogram).toHaveLength(8);

    expect(body.board_share).toHaveLength(2);
    expect(body.board_share.reduce((sum, row) => sum + row.completed_todos, 0)).toBe(2);
    expect(body.board_share.reduce((sum, row) => sum + row.completed_points, 0)).toBeCloseTo(8, 5);

    expect(body.recent).toHaveLength(2);
    expect(typeof body.recent[0]!.cycle_days).toBe("number");
  });

  it("agrees exactly with /admin/flow over the same population", async () => {
    for (const days of [2, 4, 6]) {
      const id = await card(boardA, "done", { assignee_id: admin.id });

      await backdate(id, { created: 20, started: 10, completed: 10 - days });
    }

    // Work on a second board, so what is asserted below is the two scopes
    // agreeing rather than the fixture having nothing to disagree about.
    const elsewhere = await card(boardB, "done", { assignee_id: admin.id });

    await backdate(elsewhere, { created: 28, started: 27, completed: 1 });

    const flow = (
      await client.get<{ cycle_time: DurationStats }>(
        `/api/v1/admin/flow?period=30d&board=${boardA}`,
        { token: admin.token },
      )
    ).body.cycle_time;

    expect((await detail(admin.id, `?period=30d&board=${boardA}`)).body.cycle_time).toEqual(flow);
    expect((await detail()).body.cycle_time).not.toEqual(flow);
  });

  describe("the scope facets on the drill-down", () => {
    let spaceA: string;

    beforeEach(async () => {
      const board = await prisma.boards.findUniqueOrThrow({
        where: { id: boardA },
        select: { space_id: true },
      });

      spaceA = board.space_id!;

      const here = await card(boardA, "done", { assignee_id: admin.id, estimate: 3 });
      const there = await card(boardB, "done", { assignee_id: admin.id, estimate: 5 });

      await backdate(here, { created: 10, started: 8, completed: 6 });
      await backdate(there, { created: 12, started: 9, completed: 5 });
    });

    it("narrows every figure on the payload to the board", async () => {
      const { body } = await detail(admin.id, `?period=30d&board=${boardA}`);

      expect(body.user.completed_todos).toBe(1);
      expect(body.user.completed_points).toBeCloseTo(3, 5);
      expect(body.cycle_time.n).toBe(1);
      expect(body.board_share).toHaveLength(1);
      expect(body.board_share[0]!.board_id).toBe(boardA);
      expect(body.recent).toHaveLength(1);
      expect(body.recent[0]!.board_id).toBe(boardA);
    });

    it("narrows to the space the board is filed into", async () => {
      const { body } = await detail(admin.id, `?period=30d&space=${spaceA}`);

      expect(body.user.completed_todos).toBe(1);
      expect(body.board_share).toHaveLength(1);
      expect(body.board_share[0]!.board_id).toBe(boardA);
    });

    it("leaves boards-contributed-to alone, because that is a fact about the person", async () => {
      const wide = (await detail()).body.user;
      const narrow = (await detail(admin.id, `?period=30d&board=${boardA}`)).body.user;

      expect(wide.boards).toBe(2);
      expect(narrow.boards).toBe(2);
      expect(narrow.completed_todos).toBeLessThan(wide.completed_todos);
    });

    it("rejects a facet that is not a uuid rather than ignoring it", async () => {
      expect((await detail(admin.id, "?period=30d&board=not-a-uuid")).status).toBe(400);
    });
  });

  it("orders recent completions newest first and caps them", async () => {
    for (let i = 0; i < 25; i += 1) {
      const id = await card(boardA, "done", { assignee_id: admin.id });

      await backdate(id, { created: 28, started: 27, completed: 25 - i });
    }

    const { body } = await detail();

    expect(body.recent).toHaveLength(20);

    const stamps = body.recent.map((row) => Date.parse(row.completed_at));

    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
  });

  it("credits the person work was completed BY, not who holds it now", async () => {
    const id = await card(boardA, "done", { assignee_id: admin.id });

    await backdate(id, { created: 10, started: 8, completed: 6 });

    await client.patch(
      `/api/v1/boards/${boardA}/todos/${id}`,
      { assignee_id: dev.id },
      { token: admin.token },
    );

    expect((await detail(admin.id)).body.recent).toHaveLength(1);
    expect((await detail(dev.id)).body.recent).toHaveLength(0);
  });

  it("issues a bounded number of queries", async () => {
    for (let i = 0; i < 5; i += 1) {
      const id = await card(boardA, "done", { assignee_id: admin.id });

      await backdate(id, { created: 10 + i, started: 8 + i, completed: 2 + i });
    }

    const original = pool.query.bind(pool);
    let count = 0;

    (pool as unknown as { query: unknown }).query = (...args: unknown[]) => {
      count += 1;

      return (original as (...a: unknown[]) => unknown)(...args);
    };

    try {
      await detail();
    } finally {
      (pool as unknown as { query: unknown }).query = original;
    }

    expect(count).toBeLessThanOrEqual(7);
  });
});

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
let doneColumn: string;
let todoColumn: string;

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

interface CardInput {
  columnId?: string | null;
  estimate?: number | null;
  assignee?: string | null;
  type?: string;
  parentId?: string;
}

async function card(board: string, token: string, input: CardInput = {}): Promise<string> {
  const id = randomUUID();

  const body: Record<string, unknown> = {
    title: "card",
    column_id: input.columnId === undefined ? todoColumn : input.columnId,
    rank: Math.random() * 1000,
  };

  if (input.estimate !== undefined) body.estimate = input.estimate;
  if (input.assignee !== undefined) body.assignee_id = input.assignee;
  if (input.type !== undefined) body.type = input.type;
  if (input.parentId !== undefined) body.parent_id = input.parentId;

  const response = await client.patch(`/api/v1/boards/${board}/todos/${id}`, body, { token });

  expect(response.status).toBeLessThan(300);

  return id;
}

function get<T>(path: string, token = admin.token): Promise<{ status: number; body: T }> {
  return client.get<T>(path, { token });
}

interface OverviewBody {
  period: string;
  bucket: string;
  timezone: string;
  totals: Record<string, number>;
  series: { bucket: string; completed_todos: number; completed_points: number }[];
}

interface UsersBody {
  users: {
    id: string;
    username: string;
    seniority: string | null;
    completed_todos: number;
    completed_points: number;
    unestimated_completed: number;
    comments: number;
    activities: number;
    boards: number;
    target_points: number | null;
    performance: number | null;
  }[];
}

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(async () => {
  await resetDatabase();
  admin = await makeSuperadmin("root");
  dev = await makeUser("dev");
  await addMember(admin.boardId, dev, "editor", admin.id);
  doneColumn = await columnOf(admin.boardId, "done");
  todoColumn = await columnOf(admin.boardId, "todo");
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

const ROUTES: [string, string][] = [
  ["GET", "/api/v1/admin/overview"],
  ["GET", "/api/v1/admin/users"],
  ["GET", "/api/v1/admin/boards"],
  ["GET", "/api/v1/admin/activity"],
  ["GET", "/api/v1/admin/kpi"],
  ["GET", "/api/v1/admin/audit"],
];

describe("every admin route refuses an ordinary user", () => {
  it.each(ROUTES)("%s %s answers 404", async (_method, path) => {
    expect((await client.get(path, { token: dev.token })).status).toBe(404);
  });

  it("refuses the per-user and per-board routes too", async () => {
    expect((await client.get(`/api/v1/admin/users/${dev.id}`, { token: dev.token })).status).toBe(404);
    expect((await client.get(`/api/v1/admin/boards/${dev.boardId}`, { token: dev.token })).status).toBe(404);
  });

  it("refuses the two writes", async () => {
    const seniority = await client.patch(
      `/api/v1/admin/users/${dev.id}`,
      { seniority: "senior" },
      { token: dev.token },
    );

    const kpi = await client.put(
      "/api/v1/admin/kpi/junior",
      { daily_points: 1, weekly_points: 1 },
      { token: dev.token },
    );

    expect(seniority.status).toBe(404);
    expect(kpi.status).toBe(404);
    expect(await prisma.admin_audit_log.count()).toBe(0);
  });
});

describe("GET /admin/overview", () => {
  it("defaults to seven days and reports the configured timezone", async () => {
    const { body } = await get<OverviewBody>("/api/v1/admin/overview");

    expect(body.period).toBe("7d");
    expect(body.bucket).toBe("day");
    expect(body.timezone).toBe("UTC");
  });

  it("rejects a period it does not know, rather than falling back", async () => {
    expect((await get("/api/v1/admin/overview?period=90d")).status).toBe(400);
  });

  it("buckets each period at its own resolution", async () => {
    for (const [period, bucket] of [
      ["1d", "hour"],
      ["30d", "day"],
      ["3m", "week"],
      ["quarter", "week"],
      ["year", "month"],
    ]) {
      const { body } = await get<OverviewBody>(`/api/v1/admin/overview?period=${period}`);

      expect(body.bucket).toBe(bucket);
      expect(body.series.length).toBeGreaterThan(0);
    }
  });

  it("counts completed work and leaves open work out of it", async () => {
    await card(admin.boardId, admin.token, { columnId: doneColumn, estimate: 3 });
    await card(admin.boardId, admin.token, { columnId: doneColumn, estimate: 5 });
    await card(admin.boardId, admin.token, { columnId: todoColumn, estimate: 100 });

    const { body } = await get<OverviewBody>("/api/v1/admin/overview");

    expect(body.totals.completed_todos).toBe(2);
    expect(body.totals.completed_points).toBe(8);
    expect(body.totals.open_todos).toBe(1);
  });

  // The hazard CONVENTIONS.md names for Prisma, arriving through raw pg
  // instead: count(*) is int8 and sum(estimate) is numeric, and node-postgres
  // hands both back as strings. A string renders fine and sorts "9" above
  // "10", so the assertion is on the type, not only the value.
  it("returns numbers, not strings", async () => {
    await card(admin.boardId, admin.token, { columnId: doneColumn, estimate: 3 });

    const { body } = await get<OverviewBody>("/api/v1/admin/overview");

    for (const [key, value] of Object.entries(body.totals)) {
      expect({ key, type: typeof value }).toEqual({ key, type: "number" });
    }

    expect(typeof body.series[0]!.completed_todos).toBe("number");
    expect(typeof body.series[0]!.completed_points).toBe("number");
  });

  it("zero-fills every bucket in the window, so a quiet day is a gap and not a missing bar", async () => {
    const { body } = await get<OverviewBody>("/api/v1/admin/overview?period=30d");

    expect(body.series.length).toBeGreaterThanOrEqual(30);
    expect(body.series.every((point) => typeof point.completed_todos === "number")).toBe(true);
  });

  // A bounded number of queries, whatever the data holds. The shape this
  // guards against is one query per user or per board.
  it("issues a bounded number of queries however many users there are", async () => {
    for (let i = 0; i < 4; i += 1) {
      await card(admin.boardId, admin.token, { columnId: doneColumn, estimate: i });
    }

    const original = pool.query.bind(pool);
    let count = 0;

    (pool as unknown as { query: unknown }).query = (...args: unknown[]) => {
      count += 1;

      return (original as (...a: unknown[]) => unknown)(...args);
    };

    try {
      await get("/api/v1/admin/overview");
    } finally {
      (pool as unknown as { query: unknown }).query = original;
    }

    expect(count).toBeLessThanOrEqual(3);
  });
});

describe("the points population, stated once (D-7)", () => {
  it("does not double-count an Epic alongside its children", async () => {
    const epic = await card(admin.boardId, admin.token, {
      columnId: todoColumn,
      estimate: 100,
      type: "Epic",
    });

    const first = await card(admin.boardId, admin.token, {
      columnId: doneColumn,
      estimate: 3,
      parentId: epic,
    });

    await card(admin.boardId, admin.token, { columnId: doneColumn, estimate: 5, parentId: epic });

    await client.patch(
      `/api/v1/boards/${admin.boardId}/todos/${epic}`,
      { column_id: doneColumn },
      { token: admin.token },
    );

    const { body } = await get<OverviewBody>("/api/v1/admin/overview");

    // 8, from the two tasks. 108 would mean the Epic was counted as well.
    expect(body.totals.completed_points).toBe(8);
    expect(body.totals.completed_todos).toBe(2);

    // And a subtask under one of those tasks is not a third completion.
    await card(admin.boardId, admin.token, {
      columnId: doneColumn,
      estimate: 2,
      parentId: first,
    });

    const after = await get<OverviewBody>("/api/v1/admin/overview");

    expect(after.body.totals.completed_points).toBe(8);
    expect(after.body.totals.completed_todos).toBe(2);
  });

  it("counts an unestimated card as a completion and never as zero points", async () => {
    await card(admin.boardId, admin.token, { columnId: doneColumn, estimate: 5 });
    await card(admin.boardId, admin.token, { columnId: doneColumn });

    const { body } = await get<OverviewBody>("/api/v1/admin/overview");

    expect(body.totals.completed_todos).toBe(2);
    expect(body.totals.completed_points).toBe(5);
    expect(body.totals.unestimated_completed).toBe(1);
  });
});

describe("GET /admin/users", () => {
  it("credits the person who held the card when it completed", async () => {
    await card(admin.boardId, admin.token, {
      columnId: doneColumn,
      estimate: 5,
      assignee: dev.id,
    });

    const { body } = await get<UsersBody>("/api/v1/admin/users");
    const row = body.users.find((user) => user.id === dev.id)!;

    expect(row.completed_todos).toBe(1);
    expect(row.completed_points).toBe(5);
  });

  // D-8 and D-12, as an assertion: an unclassified user still has every
  // factual metric and simply has no performance figure.
  it("gives an unclassified user facts but no performance", async () => {
    await card(admin.boardId, admin.token, {
      columnId: doneColumn,
      estimate: 5,
      assignee: dev.id,
    });

    const { body } = await get<UsersBody>("/api/v1/admin/users");
    const row = body.users.find((user) => user.id === dev.id)!;

    expect(row.seniority).toBeNull();
    expect(row.target_points).toBeNull();
    expect(row.performance).toBeNull();
    expect(row.completed_points).toBe(5);
  });

  it("produces a performance figure once a seniority is set, with both inputs beside it", async () => {
    await client.patch(
      `/api/v1/admin/users/${dev.id}`,
      { seniority: "middle" },
      { token: admin.token },
    );

    await card(admin.boardId, admin.token, {
      columnId: doneColumn,
      estimate: 20,
      assignee: dev.id,
    });

    const { body } = await get<UsersBody>("/api/v1/admin/users?period=7d");
    const row = body.users.find((user) => user.id === dev.id)!;

    expect(row.seniority).toBe("middle");
    expect(row.target_points).toBe(40);
    expect(row.performance).toBe(50);
    expect(row.completed_points).toBe(20);
  });

  // The factual half of the dashboard must not depend on the configured half.
  it("still reports every factual metric with kpi_targets emptied", async () => {
    await prisma.kpi_targets.deleteMany({});

    await client.patch(
      `/api/v1/admin/users/${dev.id}`,
      { seniority: "senior" },
      { token: admin.token },
    );

    await card(admin.boardId, admin.token, {
      columnId: doneColumn,
      estimate: 7,
      assignee: dev.id,
    });

    const { status, body } = await get<UsersBody>("/api/v1/admin/users");
    const row = body.users.find((user) => user.id === dev.id)!;

    expect(status).toBe(200);
    expect(row.completed_points).toBe(7);
    expect(row.target_points).toBeNull();
    expect(row.performance).toBeNull();
  });

  it("does not move credit when finished work is reassigned", async () => {
    const done = await card(admin.boardId, admin.token, {
      columnId: doneColumn,
      estimate: 5,
      assignee: admin.id,
    });

    await client.patch(
      `/api/v1/boards/${admin.boardId}/todos/${done}`,
      { assignee_id: dev.id },
      { token: admin.token },
    );

    const { body } = await get<UsersBody>("/api/v1/admin/users");

    expect(body.users.find((user) => user.id === admin.id)!.completed_points).toBe(5);
    expect(body.users.find((user) => user.id === dev.id)!.completed_points).toBe(0);
  });
});

describe("GET /admin/users/:id", () => {
  it("carries a year-long heatmap of completed tasks, whatever the period", async () => {
    await card(admin.boardId, admin.token, {
      columnId: doneColumn,
      estimate: 3,
      assignee: dev.id,
    });

    const { body } = await get<{
      heatmap: { metric: string; from: string; to: string; cells: { date: string; count: number }[] };
      series: unknown[];
      user: { id: string };
    }>(`/api/v1/admin/users/${dev.id}?period=1d`);

    expect(body.user.id).toBe(dev.id);
    expect(body.heatmap.metric).toBe("completed_todos");
    expect(body.heatmap.cells).toHaveLength(1);
    expect(body.heatmap.cells[0]!.count).toBe(1);

    // The period still governs the series beside it.
    expect(body.series.length).toBeGreaterThan(1);
  });

  it("404s for a user that does not exist", async () => {
    expect((await get(`/api/v1/admin/users/${randomUUID()}`)).status).toBe(404);
  });
});

describe("GET /admin/boards", () => {
  it("aggregates each board and names its owner", async () => {
    await card(admin.boardId, admin.token, { columnId: doneColumn, estimate: 4 });

    const { body } = await get<{
      boards: { id: string; owner_username: string; members: number; completed_points: number }[];
    }>("/api/v1/admin/boards");

    const row = body.boards.find((board) => board.id === admin.boardId)!;

    expect(row.owner_username).toBe(admin.username);
    expect(row.members).toBe(2);
    expect(row.completed_points).toBe(4);
    expect(typeof row.completed_points).toBe("number");
  });

  it("sees every board in the system, including ones the superadmin is no member of", async () => {
    const { body } = await get<{ boards: { id: string }[] }>("/api/v1/admin/boards");
    const ids = body.boards.map((board) => board.id);

    expect(ids).toContain(admin.boardId);
    expect(ids).toContain(dev.boardId);
  });
});

describe("GET /admin/activity", () => {
  it("filters by board, by user and by action", async () => {
    await card(admin.boardId, admin.token, {});

    const all = await get<{ activities: unknown[] }>("/api/v1/admin/activity");
    const byBoard = await get<{ activities: { board_id: string }[] }>(
      `/api/v1/admin/activity?board=${dev.boardId}`,
    );
    const byAction = await get<{ activities: { action: string }[] }>(
      "/api/v1/admin/activity?action=created",
    );

    expect(all.body.activities.length).toBeGreaterThan(0);
    expect(byBoard.body.activities.every((row) => row.board_id === dev.boardId)).toBe(true);
    expect(byAction.body.activities.every((row) => row.action === "created")).toBe(true);
  });

  it("does not return the payload blob, only the two fields a feed line renders", async () => {
    await card(admin.boardId, admin.token, {});

    const { body } = await get<{ activities: Record<string, unknown>[] }>("/api/v1/admin/activity");

    expect(body.activities[0]).toHaveProperty("title");
    expect(body.activities[0]).toHaveProperty("board_key");
    expect(body.activities[0]).not.toHaveProperty("payload");
  });

  // The bug class B7 already fixed once in the board feed: with OFFSET, a row
  // inserted between two requests shifts every later page, so the reader sees
  // one entry twice and another not at all.
  it("pages stably when rows are inserted between requests", async () => {
    for (let i = 0; i < 6; i += 1) await card(admin.boardId, admin.token, {});

    const first = await get<{
      activities: { id: string }[];
      next: { before: string; before_id: string } | null;
    }>("/api/v1/admin/activity?limit=3");

    expect(first.body.next).not.toBeNull();

    for (let i = 0; i < 3; i += 1) await card(admin.boardId, admin.token, {});

    const cursor = first.body.next!;
    const second = await get<{ activities: { id: string }[] }>(
      `/api/v1/admin/activity?limit=3&before=${encodeURIComponent(cursor.before)}&before_id=${cursor.before_id}`,
    );

    const firstIds = first.body.activities.map((row) => row.id);
    const secondIds = second.body.activities.map((row) => row.id);

    expect(secondIds).toHaveLength(3);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
  });
});

describe("KPI configuration", () => {
  it("reads the seeded targets", async () => {
    const { body } = await get<{ targets: { seniority: string; daily_points: number }[] }>(
      "/api/v1/admin/kpi",
    );

    expect(body.targets.map((target) => target.seniority)).toEqual(["junior", "middle", "senior"]);
    expect(body.targets[0]!.daily_points).toBe(6);
    expect(typeof body.targets[0]!.daily_points).toBe("number");
  });

  it("edits a target and writes an audit row", async () => {
    const response = await client.put(
      "/api/v1/admin/kpi/middle",
      { daily_points: 9, weekly_points: 45 },
      { token: admin.token },
    );

    expect(response.status).toBe(200);

    const { body } = await get<{ targets: { seniority: string; weekly_points: number }[] }>(
      "/api/v1/admin/kpi",
    );

    expect(body.targets.find((target) => target.seniority === "middle")!.weekly_points).toBe(45);

    const entries = await prisma.admin_audit_log.findMany();

    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe("kpi_target.updated");
    expect(entries[0]!.actor_id).toBe(admin.id);
    expect(entries[0]!.target_id).toBe("middle");
  });

  it("refuses a negative target, a non-numeric one and an unknown level", async () => {
    const negative = await client.put(
      "/api/v1/admin/kpi/junior",
      { daily_points: -1, weekly_points: 10 },
      { token: admin.token },
    );

    const wrongType = await client.put(
      "/api/v1/admin/kpi/junior",
      { daily_points: "lots", weekly_points: 10 },
      { token: admin.token },
    );

    const unknown = await client.put(
      "/api/v1/admin/kpi/principal",
      { daily_points: 1, weekly_points: 1 },
      { token: admin.token },
    );

    expect(negative.status).toBe(400);
    expect(wrongType.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(await prisma.admin_audit_log.count()).toBe(0);
  });

  it("accepts zero, which says this level is not measured on points", async () => {
    const response = await client.put(
      "/api/v1/admin/kpi/junior",
      { daily_points: 0, weekly_points: 0 },
      { token: admin.token },
    );

    expect(response.status).toBe(200);
  });
});

describe("PATCH /admin/users/:id", () => {
  it("sets a seniority and audits it", async () => {
    const response = await client.patch(
      `/api/v1/admin/users/${dev.id}`,
      { seniority: "senior" },
      { token: admin.token },
    );

    expect(response.status).toBe(200);

    const row = await prisma.users.findUniqueOrThrow({
      where: { id: dev.id },
      select: { seniority: true },
    });

    expect(row.seniority).toBe("senior");

    const entries = await prisma.admin_audit_log.findMany();

    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe("user.seniority_changed");
  });

  it("returns a user to unclassified, which is a real state", async () => {
    await client.patch(`/api/v1/admin/users/${dev.id}`, { seniority: "senior" }, { token: admin.token });
    await client.patch(`/api/v1/admin/users/${dev.id}`, { seniority: null }, { token: admin.token });

    const row = await prisma.users.findUniqueOrThrow({
      where: { id: dev.id },
      select: { seniority: true },
    });

    expect(row.seniority).toBeNull();
  });

  // The endpoint sets seniority and nothing else. Anything more would make
  // M34 an account-administration surface, which it explicitly is not.
  it("refuses to carry any other field", async () => {
    const response = await client.patch(
      `/api/v1/admin/users/${dev.id}`,
      { seniority: "senior", org_role: "superadmin", email: "taken@over.invalid" },
      { token: admin.token },
    );

    expect(response.status).toBe(400);

    const row = await prisma.users.findUniqueOrThrow({
      where: { id: dev.id },
      select: { org_role: true, seniority: true },
    });

    expect(row.org_role).toBe("member");
    expect(row.seniority).toBeNull();
  });

  it("refuses an unknown seniority", async () => {
    const response = await client.patch(
      `/api/v1/admin/users/${dev.id}`,
      { seniority: "principal" },
      { token: admin.token },
    );

    expect(response.status).toBe(400);
  });
});

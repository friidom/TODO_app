import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { pool } from "../../db/client.js";
import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

let client: TestClient;
let admin: TestUser;
let todoColumn: string;
let doingColumn: string;
let doneColumn: string;

const DAY = 86_400_000;

async function makeSuperadmin(name: string): Promise<TestUser> {
  const user = await makeUser(name);

  await prisma.users.update({
    where: { id: user.id },
    data: { org_role: "superadmin" },
  });

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
  columnId: string | null,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const id = randomUUID();

  const response = await client.patch(
    `/api/v1/boards/${board}/todos/${id}`,
    {
      title: "card",
      column_id: columnId,
      rank: Math.random() * 1000,
      ...extra,
    },
    { token: admin.token },
  );

  expect(response.status).toBeLessThan(300);

  return id;
}

function backdate(
  id: string,
  days: {
    created?: number;
    started?: number | null;
    completed?: number | null;
  },
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

interface FlowBody {
  period: string;
  bucket: string;
  timezone: string;
  cfd: { bucket: string; created: number; started: number; done: number }[];
  cycle_time: {
    median_days: number | null;
    p75_days: number | null;
    p90_days: number | null;
    n: number;
    unmeasured: number;
  };
  lead_time: { median_days: number | null; n: number; unmeasured: number };
  cycle_histogram: {
    from_days: number;
    to_days: number | null;
    count: number;
  }[];
  wip: { key: string; label: string; category: string; count: number }[];
  wip_aging: { key: string; label: string; count: number }[];
  slice_by: string;
  slices: {
    key: string | null;
    label: string;
    count: number;
    cycle_median_days: number | null;
  }[];
}

function flow(query = "?period=30d", token = admin.token) {
  return client.get<FlowBody>(`/api/v1/admin/flow${query}`, { token });
}

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(async () => {
  await resetDatabase();
  admin = await makeSuperadmin("root");
  todoColumn = await columnOf(admin.boardId, "todo");
  doingColumn = await columnOf(admin.boardId, "in_progress");
  doneColumn = await columnOf(admin.boardId, "done");
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

describe("GET /admin/flow — the gate and the contract", () => {
  it("is superadmin-only, answering 404 like every other admin route", async () => {
    const outsider = await makeUser("outsider");

    expect((await flow("?period=30d", outsider.token)).status).toBe(404);
  });

  it("refuses a slice it cannot group by, rather than defaulting quietly", async () => {
    expect((await flow("?period=30d&slice=title")).status).toBe(400);
  });

  it("refuses a board id that is not a uuid", async () => {
    expect((await flow("?period=30d&board=not-a-uuid")).status).toBe(400);
  });

  it("returns numbers, not strings", async () => {
    const id = await card(admin.boardId, doneColumn);
    await backdate(id, { created: 6, started: 4, completed: 2 });

    const { body } = await flow();

    expect(typeof body.cycle_time.median_days).toBe("number");
    expect(typeof body.cycle_time.n).toBe("number");
    expect(typeof body.cfd[0]!.created).toBe("number");
    expect(typeof body.wip[0]!.count).toBe("number");
  });
});

describe("cycle and lead time", () => {
  it("measures the two durations over the same completed population", async () => {
    const a = await card(admin.boardId, doneColumn);
    const b = await card(admin.boardId, doneColumn);
    const c = await card(admin.boardId, doneColumn);

    await backdate(a, { created: 10, started: 9, completed: 8 }); // cycle 1, lead 2
    await backdate(b, { created: 10, started: 8, completed: 6 }); // cycle 2, lead 4
    await backdate(c, { created: 10, started: 7, completed: 4 }); // cycle 3, lead 6

    const { body } = await flow();

    expect(body.cycle_time.median_days).toBeCloseTo(2, 5);
    expect(body.cycle_time.p75_days).toBeCloseTo(2.5, 5);
    expect(body.cycle_time.p90_days).toBeCloseTo(2.8, 5);
    expect(body.cycle_time.n).toBe(3);
    expect(body.lead_time.median_days).toBeCloseTo(4, 5);
  });

  it("excludes a completion with no start date from cycle time and counts it", async () => {
    const measured = await card(admin.boardId, doneColumn);
    const historic = await card(admin.boardId, doneColumn);

    await backdate(measured, { created: 10, started: 8, completed: 6 });
    await backdate(historic, { created: 10, started: null, completed: 5 });

    const { body } = await flow();

    expect(body.cycle_time.n).toBe(1);
    expect(body.cycle_time.unmeasured).toBe(1);
    expect(body.cycle_time.median_days).toBeCloseTo(2, 5);

    expect(body.lead_time.n).toBe(2);
    expect(body.lead_time.unmeasured).toBe(0);
    expect(body.lead_time.median_days).toBeCloseTo(4.5, 5);
  });

  it("says nothing rather than zero when nothing finished", async () => {
    await card(admin.boardId, todoColumn);

    const { body } = await flow();

    expect(body.cycle_time.median_days).toBeNull();
    expect(body.cycle_time.n).toBe(0);
    expect(body.lead_time.median_days).toBeNull();
  });

  it("fills every histogram bin, including the empty ones", async () => {
    const id = await card(admin.boardId, doneColumn);
    await backdate(id, { created: 10, started: 8, completed: 6 }); // 2 days -> [2,3)

    const { body } = await flow();

    expect(body.cycle_histogram).toHaveLength(8);
    expect(body.cycle_histogram.at(-1)!.to_days).toBeNull();
    expect(body.cycle_histogram.find((bin) => bin.from_days === 2)!.count).toBe(1);
    expect(body.cycle_histogram.find((bin) => bin.from_days === 5)!.count).toBe(0);
  });
});

describe("the cumulative flow diagram", () => {
  it("is cumulative — no band ever falls as the window advances", async () => {
    for (const days of [20, 15, 10, 5]) {
      const id = await card(admin.boardId, doneColumn);
      await backdate(id, {
        created: days + 4,
        started: days + 2,
        completed: days,
      });
    }

    const { body } = await flow();

    expect(body.cfd.length).toBeGreaterThan(1);

    for (let i = 1; i < body.cfd.length; i += 1) {
      expect(body.cfd[i]!.created).toBeGreaterThanOrEqual(body.cfd[i - 1]!.created);
      expect(body.cfd[i]!.started).toBeGreaterThanOrEqual(body.cfd[i - 1]!.started);
      expect(body.cfd[i]!.done).toBeGreaterThanOrEqual(body.cfd[i - 1]!.done);
    }

    expect(body.cfd.at(-1)!.done).toBe(4);
    expect(body.cfd.at(-1)!.created).toBe(4);
  });

  it("counts work that existed before the window in the first bucket", async () => {
    const old = await card(admin.boardId, doneColumn);
    await backdate(old, { created: 300, started: 299, completed: 298 });

    const { body } = await flow("?period=7d");

    expect(body.cfd[0]!.created).toBe(1);
    expect(body.cfd[0]!.done).toBe(1);
  });

  it("bands never exceed the one beneath them", async () => {
    const a = await card(admin.boardId, doneColumn);
    const b = await card(admin.boardId, doingColumn);
    await card(admin.boardId, todoColumn);

    await backdate(a, { created: 8, started: 6, completed: 4 });
    await backdate(b, { created: 8, started: 3 });

    const { body } = await flow();

    for (const point of body.cfd) {
      expect(point.started).toBeGreaterThanOrEqual(point.done);
      expect(point.created).toBeGreaterThanOrEqual(point.started);
    }
  });
});

describe("work in progress", () => {
  it("groups by category across the system, in pipeline order", async () => {
    await card(admin.boardId, todoColumn);
    await card(admin.boardId, doingColumn);
    await card(admin.boardId, null);

    const { body } = await flow();

    expect(body.wip.map((slice) => slice.key)).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "in_review",
    ]);
    expect(body.wip.map((slice) => slice.count)).toEqual([1, 1, 1, 0]);
  });

  it("omits done work, which is finished rather than in progress", async () => {
    const done = await card(admin.boardId, doneColumn);
    await backdate(done, { created: 5, started: 4, completed: 3 });

    const { body } = await flow();

    expect(body.wip.every((slice) => slice.category !== "done")).toBe(true);
    expect(body.wip.reduce((sum, slice) => sum + slice.count, 0)).toBe(0);
  });

  it("groups by column when scoped to one board, keeping empty columns", async () => {
    await card(admin.boardId, todoColumn);

    const { body } = await flow(`?period=30d&board=${admin.boardId}`);

    expect(body.wip).toHaveLength(4);
    expect(body.wip.filter((slice) => slice.category === "in_progress")).toHaveLength(1);
    expect(body.wip.filter((slice) => slice.category === "in_review")).toHaveLength(1);
    expect(body.wip.find((slice) => slice.label === "To Do")!.count).toBe(1);
    expect(body.wip.find((slice) => slice.label === "In Review")!.count).toBe(0);
  });
});

describe("WIP aging", () => {
  it("always returns the five buckets, zeros included", async () => {
    const { body } = await flow();

    expect(body.wip_aging.map((bucket) => bucket.key)).toEqual([
      "0-2",
      "3-7",
      "8-14",
      "15-30",
      "30+",
    ]);
    expect(body.wip_aging.every((bucket) => bucket.count === 0)).toBe(true);
  });

  it("buckets open work by how long it has been started", async () => {
    const fresh = await card(admin.boardId, doingColumn);
    const stale = await card(admin.boardId, doingColumn);
    const ancient = await card(admin.boardId, doingColumn);

    await backdate(fresh, { started: 1 });
    await backdate(stale, { started: 5 });
    await backdate(ancient, { started: 100 });

    const { body } = await flow();
    const count = (key: string): number =>
      body.wip_aging.find((bucket) => bucket.key === key)!.count;

    expect(count("0-2")).toBe(1);
    expect(count("3-7")).toBe(1);
    expect(count("30+")).toBe(1);
  });

  it("ignores finished work, however old", async () => {
    const done = await card(admin.boardId, doneColumn);
    await backdate(done, { created: 200, started: 199, completed: 100 });

    const { body } = await flow();

    expect(body.wip_aging.every((bucket) => bucket.count === 0)).toBe(true);
  });
});

describe("the scope filter", () => {
  it("narrows every figure to one board", async () => {
    const other = await makeUser("other");
    const otherDone = await columnOf(other.boardId, "done");

    const mine = await card(admin.boardId, doneColumn);
    await backdate(mine, { created: 8, started: 6, completed: 4 });

    const theirs = randomUUID();
    await client.patch(
      `/api/v1/boards/${other.boardId}/todos/${theirs}`,
      { title: "card", column_id: otherDone, rank: 1 },
      { token: other.token },
    );
    await backdate(theirs, { created: 8, started: 7, completed: 4 });

    expect((await flow()).body.cycle_time.n).toBe(2);
    expect((await flow(`?period=30d&board=${admin.boardId}`)).body.cycle_time.n).toBe(1);
  });

  it("narrows to a space through the boards filed into it", async () => {
    const space = await prisma.spaces.findFirstOrThrow({
      where: { owner_id: admin.id },
      select: { id: true },
    });

    await prisma.boards.update({
      where: { id: admin.boardId },
      data: { space_id: space.id },
    });

    const id = await card(admin.boardId, doneColumn);
    await backdate(id, { created: 8, started: 6, completed: 4 });

    expect((await flow(`?period=30d&space=${space.id}`)).body.cycle_time.n).toBe(1);
    expect((await flow(`?period=30d&space=${randomUUID()}`)).body.cycle_time.n).toBe(0);
  });
});

describe("the slice", () => {
  it("cuts the durations by estimate, and names the unestimated bucket", async () => {
    const sized = await card(admin.boardId, doneColumn, { estimate: 8 });
    const unsized = await card(admin.boardId, doneColumn);

    await backdate(sized, { created: 10, started: 8, completed: 3 });
    await backdate(unsized, { created: 10, started: 9, completed: 8 });

    const { body } = await flow("?period=30d&slice=estimate");

    expect(body.slice_by).toBe("estimate");
    expect(body.slices.find((slice) => slice.key === "8")!.cycle_median_days).toBeCloseTo(5, 5);
    expect(body.slices.find((slice) => slice.key === null)!.label).toBe("Unestimated");
  });

  it("cuts by type when asked", async () => {
    const bug = await card(admin.boardId, doneColumn, { type: "Bug" });
    await backdate(bug, { created: 10, started: 8, completed: 6 });

    const { body } = await flow("?period=30d&slice=type");

    expect(body.slice_by).toBe("type");
    expect(body.slices.map((slice) => slice.key)).toContain("Bug");
  });
});

describe("the query budget", () => {
  it("issues a bounded number of queries however much data there is", async () => {
    for (let i = 0; i < 6; i += 1) {
      const id = await card(admin.boardId, doneColumn, { estimate: i });
      await backdate(id, { created: 10 + i, started: 8 + i, completed: 2 + i });
    }

    const original = pool.query.bind(pool);
    let count = 0;

    (pool as unknown as { query: unknown }).query = (...args: unknown[]) => {
      count += 1;

      return (original as (...a: unknown[]) => unknown)(...args);
    };

    try {
      await flow();
    } finally {
      (pool as unknown as { query: unknown }).query = original;
    }

    expect(count).toBeLessThanOrEqual(7);
  });
});

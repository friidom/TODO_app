import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import {
  addMember,
  firstColumnOf,
  makeUser,
  type TestUser,
} from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";
import { adminRoutes } from "./admin.routes.js";

// M34 Phase H: the role matrix, every admin route against every kind of
// caller. M3-16 did this as a .sql script because authorization was RLS and
// a policy could be exercised with a SELECT. It is middleware now, so a SQL
// script cannot reach it, and CLAUDE.md allows exactly one test mechanism.
//
// The route list is read from the router's own stack rather than written out
// here. A hand-kept list is a list somebody has to remember to extend, which
// is the failure this file exists to catch.
interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

const ROUTES = (adminRoutes as unknown as { stack: RouteLayer[] }).stack
  .filter((layer): layer is Required<RouteLayer> => layer.route !== undefined)
  .flatMap((layer) =>
    Object.keys(layer.route.methods).map((method) => ({
      method: method.toUpperCase(),
      path: layer.route.path,
    })),
  );

let client: TestClient;
let superadmin: TestUser;
let outsider: TestUser;
let boardOwner: TestUser;
let boardAdmin: TestUser;
let superadminSpace: string;
let superadminTodo: string;

// :id means a user on /users, a board on /boards, a space on /spaces and a
// task on /todos, so the substitution has to know which -- otherwise the
// matrix "passes" on a 404 it caused itself.
function urlFor(path: string): string {
  const id = path.startsWith("/boards")
    ? superadmin.boardId
    : path.startsWith("/spaces")
      ? superadminSpace
      : path.startsWith("/todos")
        ? superadminTodo
        : superadmin.id;

  return `/api/v1/admin${path.replace(":id", id).replace(":seniority", "junior")}`;
}

function send(method: string, url: string, token: string) {
  const body =
    method === "PATCH" ? { seniority: "senior" } : { daily_points: 1, weekly_points: 1 };

  switch (method) {
    case "GET":
      return client.get(url, { token });
    case "PATCH":
      return client.patch(url, body, { token });
    case "PUT":
      return client.put(url, body, { token });
    default:
      throw new Error(`unhandled method in the matrix: ${method}`);
  }
}

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(async () => {
  await resetDatabase();

  superadmin = await makeUser("root");
  superadminSpace = (
    await prisma.spaces.findFirstOrThrow({
      where: { owner_id: superadmin.id },
      select: { id: true },
    })
  ).id;
  superadminTodo = randomUUID();
  await client.patch(
    `/api/v1/boards/${superadmin.boardId}/todos/${superadminTodo}`,
    {
      title: "matrix fixture",
      column_id: (await firstColumnOf(superadmin.boardId)).id,
      rank: 1,
    },
    { token: superadmin.token },
  );
  await prisma.users.update({
    where: { id: superadmin.id },
    data: { org_role: "superadmin" },
  });

  outsider = await makeUser("outsider");
  boardOwner = await makeUser("owner");
  boardAdmin = await makeUser("boardadmin");

  // A board admin is the highest board role short of owner, and the point of
  // including them is that it buys nothing at all outside their own board.
  await addMember(boardOwner.boardId, boardAdmin, "admin", boardOwner.id);
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

describe("the admin role matrix", () => {
  it("has routes to check", () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(10);
  });

  it.each(ROUTES)("$method $path is 404 for a signed-in non-superadmin", async ({ method, path }) => {
    for (const actor of [outsider, boardOwner, boardAdmin]) {
      const response = await send(method, urlFor(path), actor.token);

      expect({ method, path, status: response.status }).toEqual({
        method,
        path,
        status: 404,
      });
    }
  });

  it.each(ROUTES)("$method $path is 401 unauthenticated", async ({ method, path }) => {
    const url = urlFor(path);
    const response =
      method === "GET"
        ? await client.get(url)
        : method === "PUT"
          ? await client.put(url, { daily_points: 1, weekly_points: 1 })
          : await client.patch(url, { seniority: "senior" });

    expect(response.status).toBe(401);
  });

  it.each(ROUTES)("$method $path answers a superadmin", async ({ method, path }) => {
    const response = await send(method, urlFor(path), superadmin.token);

    expect(response.status).toBeLessThan(400);
  });
});

describe("elevated read never becomes elevated write (§10.7 rule 1)", () => {
  // The single assertion that keeps this milestone honest. A superadmin sees
  // every board in /admin/boards and can still touch none of them.
  it("leaves a superadmin a stranger to a board they are not a member of", async () => {
    const board = boardOwner.boardId;
    const column = await prisma.columns.findFirstOrThrow({
      where: { board_id: board },
      select: { id: true },
    });

    const attempts = [
      await client.get(`/api/v1/boards/${board}`, { token: superadmin.token }),
      await client.patch(`/api/v1/boards/${board}`, { title: "Seized" }, { token: superadmin.token }),
      await client.del(`/api/v1/boards/${board}`, undefined, { token: superadmin.token }),
      await client.get(`/api/v1/boards/${board}/todos`, { token: superadmin.token }),
      await client.patch(
        `/api/v1/boards/${board}/todos/${randomUUID()}`,
        { title: "Planted", column_id: column.id, rank: 1 },
        { token: superadmin.token },
      ),
      await client.get(`/api/v1/boards/${board}/members`, { token: superadmin.token }),
      await client.get(`/api/v1/boards/${board}/activities`, { token: superadmin.token }),
      await client.patch(`/api/v1/columns/${column.id}`, { title: "Renamed" }, { token: superadmin.token }),
    ];

    expect(attempts.map((response) => response.status)).toEqual(attempts.map(() => 404));

    const after = await prisma.boards.findUniqueOrThrow({
      where: { id: board },
      select: { title: true, owner_id: true },
    });

    expect(after.title).not.toBe("Seized");
    expect(after.owner_id).toBe(boardOwner.id);
    expect(await prisma.todos.count({ where: { board_id: board } })).toBe(0);
  });

  it("still sees that board in the admin aggregates", async () => {
    const { body } = await client.get<{ boards: { id: string }[] }>("/api/v1/admin/boards", {
      token: superadmin.token,
    });

    expect(body.boards.map((board) => board.id)).toContain(boardOwner.boardId);
  });
});

describe("the admin surface writes two things and nothing else", () => {
  it("leaves every table but kpi_targets, users and the audit log untouched", async () => {
    const before = await snapshot();

    for (const { method, path } of ROUTES) {
      await send(method, urlFor(path), superadmin.token);
    }

    const after = await snapshot();

    expect(after.todos).toBe(before.todos);
    expect(after.boards).toBe(before.boards);
    expect(after.columns).toBe(before.columns);
    expect(after.comments).toBe(before.comments);
    expect(after.members).toBe(before.members);
    expect(after.users).toBe(before.users);
    expect(after.activities).toBe(before.activities);

    // The two writes did happen, so the test is not passing because the
    // requests were all refused.
    expect(after.audit).toBeGreaterThan(before.audit);
  });
});

describe("admin_audit_log", () => {
  it("cannot be rewritten or deleted by anyone, the owner included", async () => {
    await client.put(
      "/api/v1/admin/kpi/junior",
      { daily_points: 2, weekly_points: 10 },
      { token: superadmin.token },
    );

    const row = await prisma.admin_audit_log.findFirstOrThrow();

    await expect(
      prisma.admin_audit_log.update({ where: { id: row.id }, data: { action: "x" } }),
    ).rejects.toThrow(/append-only/);

    await expect(prisma.admin_audit_log.delete({ where: { id: row.id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it("records who did it, so an elevated action is attributable", async () => {
    await client.patch(
      `/api/v1/admin/users/${outsider.id}`,
      { seniority: "middle" },
      { token: superadmin.token },
    );

    const row = await prisma.admin_audit_log.findFirstOrThrow({
      where: { action: "user.seniority_changed" },
    });

    expect(row.actor_id).toBe(superadmin.id);
    expect(row.target_id).toBe(outsider.id);
  });
});

async function snapshot() {
  const [todos, boards, columns, comments, members, users, activities, audit] = await Promise.all([
    prisma.todos.count(),
    prisma.boards.count(),
    prisma.columns.count(),
    prisma.comments.count(),
    prisma.board_members.count(),
    prisma.users.count(),
    prisma.activities.count(),
    prisma.admin_audit_log.count(),
  ]);

  return { todos, boards, columns, comments, members, users, activities, audit };
}

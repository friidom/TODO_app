import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, firstColumnOf, makeUser, type TestUser } from "../../testing/fixtures.js";
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

interface Todo {
  id: string;
  board_id: string;
  title: string | null;
  parent_id: string | null;
  assignee_id: string | null;
  position: number | null;
  estimate: number | null;
}

async function addTodo(
  actor: TestUser,
  boardId: string,
  body: Record<string, unknown>,
): Promise<Todo> {
  const column = await firstColumnOf(boardId);
  const response = await client.post<Todo>(
    `/api/v1/boards/${boardId}/todos`,
    { column_id: column.id, ...body },
    { token: actor.token },
  );

  return response.body;
}

describe("GET /me/feed", () => {
  it("needs a token", async () => {
    expect((await client.get("/api/v1/me/feed")).status).toBe(401);
  });

  it("rejects an unknown tab", async () => {
    const alice = await makeUser("alice");

    expect((await client.get("/api/v1/me/feed?tab=everything", { token: alice.token })).status).toBe(
      400,
    );
  });

  // The property §11.6 singles out: scope BEFORE the limit, or the page fills
  // with rows the actor cannot see and is then emptied.
  it("SCOPES TO ACCESSIBLE BOARDS BEFORE THE LIMIT", async () => {
    const alice = await makeUser("alice");
    const mallory = await makeUser("mallory");

    await addTodo(alice, alice.boardId, { title: "mine" });

    // Newer than Alice's, and there are more of them than the page holds, so an
    // unscoped query would return only Mallory's.
    for (let index = 0; index < 5; index += 1) {
      await addTodo(mallory, mallory.boardId, { title: `theirs ${index}` });
    }

    const response = await client.get<Todo[]>("/api/v1/me/feed?tab=recent&limit=3", {
      token: alice.token,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]!.title).toBe("mine");
    expect(response.body.every((t) => t.board_id === alice.boardId)).toBe(true);
  });

  it("includes a board the caller was added to", async () => {
    const alice = await makeUser("alice");
    const owner = await makeUser("owner");

    await addMember(owner.boardId, alice, "viewer", owner.id);
    await addTodo(owner, owner.boardId, { title: "shared work" });

    const response = await client.get<Todo[]>("/api/v1/me/feed?tab=recent", {
      token: alice.token,
    });

    expect(response.body.map((t) => t.title)).toContain("shared work");
  });

  it("is empty for someone with no boards at all", async () => {
    const alice = await makeUser("alice");

    // The owner membership row is immutable while its board exists, so the
    // board goes and takes the membership with it.
    await prisma.boards.delete({ where: { id: alice.boardId } });

    const response = await client.get<Todo[]>("/api/v1/me/feed?tab=recent", {
      token: alice.token,
    });

    expect(response.body).toEqual([]);
  });

  it("returns only top-level items on every tab", async () => {
    const alice = await makeUser("alice");
    const epic = await addTodo(alice, alice.boardId, { title: "Epic", type: "Epic" });

    await addTodo(alice, alice.boardId, {
      title: "Child",
      parent_id: epic.id,
      assignee_id: alice.id,
    });
    await addTodo(alice, alice.boardId, { title: "Top level", assignee_id: alice.id });

    for (const tab of ["recent", "assigned"]) {
      const response = await client.get<Todo[]>(`/api/v1/me/feed?tab=${tab}`, {
        token: alice.token,
      });

      expect(response.body.every((t) => t.parent_id === null), tab).toBe(true);
    }
  });

  it("serialises position and estimate as numbers", async () => {
    const alice = await makeUser("alice");

    await addTodo(alice, alice.boardId, { title: "one", estimate: 3 });

    const response = await client.get<Todo[]>("/api/v1/me/feed?tab=recent", {
      token: alice.token,
    });

    expect(typeof response.body[0]!.position).toBe("number");
    expect(response.body[0]!.estimate).toBe(3);
  });
});

describe("GET /me/feed?tab=assigned", () => {
  it("returns only cards assigned to the caller", async () => {
    const alice = await makeUser("alice");
    const other = await makeUser("other");

    await addMember(alice.boardId, other, "editor", alice.id);
    await addTodo(alice, alice.boardId, { title: "mine", assignee_id: alice.id });
    await addTodo(alice, alice.boardId, { title: "theirs", assignee_id: other.id });
    await addTodo(alice, alice.boardId, { title: "nobody's" });

    const response = await client.get<Todo[]>("/api/v1/me/feed?tab=assigned", {
      token: alice.token,
    });

    expect(response.body.map((t) => t.title)).toEqual(["mine"]);
  });

  it("does not return work assigned to the caller on a board they left", async () => {
    const alice = await makeUser("alice");
    const owner = await makeUser("owner");

    await addMember(owner.boardId, alice, "editor", owner.id);
    await addTodo(owner, owner.boardId, { title: "shared", assignee_id: alice.id });

    await client.del(`/api/v1/boards/${owner.boardId}/members/me`, undefined, {
      token: alice.token,
    });

    const response = await client.get<Todo[]>("/api/v1/me/feed?tab=assigned", {
      token: alice.token,
    });

    expect(response.body).toHaveLength(0);
  });
});

describe("GET /me/worked-on", () => {
  it("returns ids and dates, newest first", async () => {
    const alice = await makeUser("alice");
    const first = await addTodo(alice, alice.boardId, { title: "first" });
    const second = await addTodo(alice, alice.boardId, { title: "second" });

    await client.patch(
      `/api/v1/boards/${alice.boardId}/todos/${first.id}`,
      { title: "first, edited" },
      { token: alice.token },
    );

    const response = await client.get<{ id: string; at: string }[]>("/api/v1/me/worked-on", {
      token: alice.token,
    });

    expect(response.status).toBe(200);
    expect(response.body.map((entry) => entry.id)).toEqual([first.id, second.id]);
    expect(Number.isNaN(Date.parse(response.body[0]!.at))).toBe(false);
  });

  it("counts a card once however many times it was touched", async () => {
    const alice = await makeUser("alice");
    const todo = await addTodo(alice, alice.boardId, { title: "busy" });

    for (const title of ["a", "b", "c"]) {
      await client.patch(
        `/api/v1/boards/${alice.boardId}/todos/${todo.id}`,
        { title },
        { token: alice.token },
      );
    }

    const response = await client.get<{ id: string }[]>("/api/v1/me/worked-on", {
      token: alice.token,
    });

    expect(response.body.filter((entry) => entry.id === todo.id)).toHaveLength(1);
  });

  it("does not return cards touched only by someone else", async () => {
    const alice = await makeUser("alice");
    const other = await makeUser("other");

    await addMember(alice.boardId, other, "editor", alice.id);

    const theirs = await addTodo(other, alice.boardId, { title: "their work" });

    const response = await client.get<{ id: string }[]>("/api/v1/me/worked-on", {
      token: alice.token,
    });

    expect(response.body.map((entry) => entry.id)).not.toContain(theirs.id);
  });

  it("does not return a card from a board the caller has since left", async () => {
    const alice = await makeUser("alice");
    const owner = await makeUser("owner");

    await addMember(owner.boardId, alice, "editor", owner.id);
    await addTodo(alice, owner.boardId, { title: "worked on it" });

    await client.del(`/api/v1/boards/${owner.boardId}/members/me`, undefined, {
      token: alice.token,
    });

    const response = await client.get<unknown[]>("/api/v1/me/worked-on", {
      token: alice.token,
    });

    expect(response.body).toHaveLength(0);
  });

  it("needs a token", async () => {
    expect((await client.get("/api/v1/me/worked-on")).status).toBe(401);
  });
});

// The viewed tab keeps its ids in localStorage, so this is the one read that
// takes ids from the client. They are still filtered to reachable boards.
describe("GET /me/todos?ids=", () => {
  it("returns the named cards", async () => {
    const alice = await makeUser("alice");
    const one = await addTodo(alice, alice.boardId, { title: "one" });
    const two = await addTodo(alice, alice.boardId, { title: "two" });

    await addTodo(alice, alice.boardId, { title: "three" });

    const response = await client.get<Todo[]>(
      `/api/v1/me/todos?ids=${one.id},${two.id}`,
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(new Set(response.body.map((t) => t.id))).toEqual(new Set([one.id, two.id]));
  });

  it("SILENTLY DROPS an id on a board the caller cannot reach", async () => {
    const alice = await makeUser("alice");
    const mallory = await makeUser("mallory");
    const mine = await addTodo(alice, alice.boardId, { title: "mine" });
    const theirs = await addTodo(mallory, mallory.boardId, { title: "theirs" });

    const response = await client.get<Todo[]>(
      `/api/v1/me/todos?ids=${mine.id},${theirs.id}`,
      { token: alice.token },
    );

    expect(response.body.map((t) => t.id)).toEqual([mine.id]);
  });

  it("returns only top-level items", async () => {
    const alice = await makeUser("alice");
    const epic = await addTodo(alice, alice.boardId, { title: "Epic", type: "Epic" });
    const child = await addTodo(alice, alice.boardId, {
      title: "Child",
      parent_id: epic.id,
    });

    const response = await client.get<Todo[]>(
      `/api/v1/me/todos?ids=${epic.id},${child.id}`,
      { token: alice.token },
    );

    expect(response.body.map((t) => t.id)).toEqual([epic.id]);
  });

  it("rejects a malformed id rather than ignoring it", async () => {
    const alice = await makeUser("alice");

    expect(
      (await client.get("/api/v1/me/todos?ids=not-a-uuid", { token: alice.token })).status,
    ).toBe(400);
  });

  it("needs a token", async () => {
    expect((await client.get("/api/v1/me/todos?ids=")).status).toBe(401);
  });
});

describe("GET /boards/:boardId/activities", () => {
  it("returns the board's feed newest first, capped", async () => {
    const alice = await makeUser("alice");

    for (let index = 0; index < 4; index += 1) {
      await addTodo(alice, alice.boardId, { title: `card ${index}` });
    }

    const response = await client.get<{ created_at: string }[]>(
      `/api/v1/boards/${alice.boardId}/activities?limit=3`,
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);

    const times = response.body.map((a) => a.created_at);

    expect(times).toEqual([...times].sort().reverse());
  });

  it("answers 404 for a non-member", async () => {
    const alice = await makeUser("alice");
    const outsider = await makeUser("outsider");

    expect(
      (await client.get(`/api/v1/boards/${alice.boardId}/activities`, { token: outsider.token }))
        .status,
    ).toBe(404);
  });

  it("has no write path", async () => {
    const alice = await makeUser("alice");
    const response = await client.post(
      `/api/v1/boards/${alice.boardId}/activities`,
      { entity_type: "todo", action: "created" },
      { token: alice.token },
    );

    expect(response.status).toBe(404);
  });
});

describe("GET /todos/:todoId/activities", () => {
  it("returns one card's history, unbounded by default", async () => {
    const alice = await makeUser("alice");
    const todo = await addTodo(alice, alice.boardId, { title: "card" });

    for (const title of ["a", "b", "c"]) {
      await client.patch(
        `/api/v1/boards/${alice.boardId}/todos/${todo.id}`,
        { title },
        { token: alice.token },
      );
    }

    const response = await client.get<{ entity_id: string; action: string }[]>(
      `/api/v1/todos/${todo.id}/activities`,
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThanOrEqual(4);
    expect(response.body.every((a) => a.entity_id === todo.id)).toBe(true);
  });

  // entity_type is part of the filter, not decoration: a member event whose
  // entity_id happened to equal this card's id would otherwise appear here.
  it("returns only todo events, never a member event with a colliding id", async () => {
    const alice = await makeUser("alice");
    const member = await makeUser("member");
    const todo = await addTodo(alice, alice.boardId, { title: "card" });

    await addMember(alice.boardId, member, "viewer", alice.id);

    await prisma.activities.create({
      data: {
        board_id: alice.boardId,
        actor_id: alice.id,
        entity_type: "member",
        entity_id: todo.id,
        action: "added",
        payload: {},
      },
    });

    const response = await client.get<{ entity_type: string }[]>(
      `/api/v1/todos/${todo.id}/activities`,
      { token: alice.token },
    );

    expect(response.body.every((a) => a.entity_type === "todo")).toBe(true);
  });

  it("answers 404 for a card on another board", async () => {
    const alice = await makeUser("alice");
    const other = await makeUser("other");
    const theirs = await addTodo(other, other.boardId, { title: "theirs" });

    expect(
      (await client.get(`/api/v1/todos/${theirs.id}/activities`, { token: alice.token })).status,
    ).toBe(404);
  });
});

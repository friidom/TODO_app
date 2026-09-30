import net from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../db/prisma.js";
import { disconnect, resetDatabase } from "../testing/db.js";
import { addMember, firstStatusOf, makeUser, type TestUser } from "../testing/fixtures.js";
import { startTestServer, type TestClient } from "../testing/httpClient.js";
import { MemoryCacheStore, unavailableStore } from "../testing/memoryCache.js";
import { setCacheStore } from "./cache.js";
import { boardCache } from "./keys.js";
import { createRedisStore } from "./redis.js";

interface Todo {
  id: string;
  title: string | null;
}

let client: TestClient;
let store: MemoryCacheStore;

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(async () => {
  await resetDatabase();
  store = new MemoryCacheStore();
  setCacheStore(store);
});

afterAll(async () => {
  setCacheStore(null);
  await client.close();
  await disconnect();
});

function todosOf(user: TestUser, boardId = user.boardId) {
  return client.get<Todo[]>(`/api/v1/boards/${boardId}/todos`, { token: user.token });
}

async function addTodo(user: TestUser, title: string): Promise<Todo> {
  const status = await firstStatusOf(user.boardId);
  const response = await client.post<Todo>(
    `/api/v1/boards/${user.boardId}/todos`,
    { title, status_id: status.id },
    { token: user.token },
  );

  expect(response.status).toBe(201);

  return response.body;
}

function rename(user: TestUser, todo: Todo, title: string) {
  return client.patch(`/api/v1/boards/${user.boardId}/todos/${todo.id}`, { title }, { token: user.token });
}

function titles(todos: Todo[]): (string | null)[] {
  return todos.map((todo) => todo.title);
}

function closedPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;

      server.close(() => resolve(port));
    });
  });
}

describe("cache-aside", () => {
  it("answers the first read from PostgreSQL and stores exactly what it sent", async () => {
    const alice = await makeUser("alice");
    await addTodo(alice, "first");

    const response = await todosOf(alice);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache")).toBe("MISS");
    expect(titles(response.body)).toEqual(["first"]);

    const stored = store.entries.get(boardCache.todos(alice.boardId).key);

    expect(stored?.ttlSeconds).toBe(boardCache.todos(alice.boardId).ttlSeconds);
    expect(JSON.parse(stored!.value)).toEqual(response.body);
  });

  it("answers the second read from the cache without reading PostgreSQL", async () => {
    const alice = await makeUser("alice");
    const todo = await addTodo(alice, "first");
    await todosOf(alice);

    // Written behind the API, so no invalidation runs: only a read that never
    // reached PostgreSQL can still return the old title.
    await prisma.todos.update({ where: { id: todo.id }, data: { title: "changed in the database" } });

    const response = await todosOf(alice);

    expect(response.headers.get("x-cache")).toBe("HIT");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(titles(response.body)).toEqual(["first"]);
  });
});

describe("invalidation", () => {
  it("drops the board's entry when a card changes, and the next read is fresh", async () => {
    const alice = await makeUser("alice");
    const todo = await addTodo(alice, "first");
    await todosOf(alice);

    expect((await rename(alice, todo, "renamed")).status).toBe(200);
    expect(store.entries.has(boardCache.todos(alice.boardId).key)).toBe(false);

    const response = await todosOf(alice);

    expect(response.headers.get("x-cache")).toBe("MISS");
    expect(titles(response.body)).toEqual(["renamed"]);
  });

  it("leaves every other board's entries in place", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const todo = await addTodo(alice, "first");
    await todosOf(alice);
    await todosOf(bob);

    await rename(alice, todo, "renamed");

    expect(store.entries.has(boardCache.todos(bob.boardId).key)).toBe(true);
  });

  it("refreshes the board row when a card is created, because the insert advanced next_key", async () => {
    const alice = await makeUser("alice");
    const path = `/api/v1/boards/${alice.boardId}`;
    const before = await client.get<{ next_key: number }>(path, { token: alice.token });

    await addTodo(alice, "first");

    const after = await client.get<{ next_key: number }>(path, { token: alice.token });

    expect(after.headers.get("x-cache")).toBe("MISS");
    expect(after.body.next_key).toBe(before.body.next_key + 1);
  });

  it("refreshes the roster on every board of someone who renames themselves", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    await addMember(alice.boardId, bob, "editor", alice.id);

    const roster = `/api/v1/boards/${alice.boardId}/members`;
    await client.get(roster, { token: alice.token });
    await client.get(`/api/v1/boards/${bob.boardId}/members`, { token: bob.token });

    const renamed = await client.patch("/api/v1/users/me", { full_name: "Bob Renamed" }, { token: bob.token });

    expect(renamed.status).toBe(200);
    expect(store.entries.has(boardCache.members(bob.boardId).key)).toBe(false);

    const response = await client.get<{ id: string; full_name: string | null }[]>(roster, {
      token: alice.token,
    });

    expect(response.headers.get("x-cache")).toBe("MISS");
    expect(response.body.find((member) => member.id === bob.id)?.full_name).toBe("Bob Renamed");
  });
});

describe("scoping", () => {
  const BOARD_READS = ["", "/todos", "/workflow", "/members", "/sprints", "/activities?limit=50"];

  it("answers a non-member 404 on every cached read, even while the entry is cached", async () => {
    const alice = await makeUser("alice");
    const mallory = await makeUser("mallory");
    await addTodo(alice, "private");

    for (const path of BOARD_READS) {
      const url = `/api/v1/boards/${alice.boardId}${path}`;

      await client.get(url, { token: alice.token });
      expect((await client.get(url, { token: alice.token })).headers.get("x-cache")).toBe("HIT");

      const response = await client.get(url, { token: mallory.token });

      expect(response.status).toBe(404);
      expect(response.headers.get("x-cache")).toBeNull();
    }
  });

  it("stops serving a member the moment they are removed, though the entry is still cached", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    await addMember(alice.boardId, bob, "editor", alice.id);
    await todosOf(bob, alice.boardId);

    expect((await todosOf(bob, alice.boardId)).headers.get("x-cache")).toBe("HIT");

    const removed = await client.del(`/api/v1/boards/${alice.boardId}/members/${bob.id}`, undefined, {
      token: alice.token,
    });

    expect(removed.status).toBe(204);
    expect(store.entries.has(boardCache.todos(alice.boardId).key)).toBe(true);
    expect((await todosOf(bob, alice.boardId)).status).toBe(404);
  });

  it("caches nothing whose answer depends on who is asking", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    await addMember(alice.boardId, bob, "viewer", alice.id);

    for (const path of ["/api/v1/auth/me", "/api/v1/boards", "/api/v1/notifications/unread-count"]) {
      for (const user of [alice, bob, alice]) {
        const response = await client.get(path, { token: user.token });

        expect(response.status).toBe(200);
        expect(response.headers.get("x-cache")).toBeNull();
      }
    }

    const me = await client.get<{ user: { id: string } }>("/api/v1/auth/me", { token: bob.token });

    expect(me.body.user.id).toBe(bob.id);
    expect([...store.entries.keys()].some((key) => key.includes(alice.id) || key.includes(bob.id))).toBe(
      false,
    );
  });
});

describe("Redis unavailable", () => {
  it("serves reads from PostgreSQL and lets writes succeed", async () => {
    setCacheStore(unavailableStore);

    const alice = await makeUser("alice");
    const todo = await addTodo(alice, "first");
    const first = await todosOf(alice);

    expect(first.status).toBe(200);
    expect(first.headers.get("x-cache")).toBe("MISS");
    expect(titles(first.body)).toEqual(["first"]);

    expect((await rename(alice, todo, "renamed")).status).toBe(200);
    expect(titles((await todosOf(alice)).body)).toEqual(["renamed"]);
  });

  it("does not wait on a real Redis client whose server refuses connections", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const redis = createRedisStore(`redis://127.0.0.1:${await closedPort()}`);

    setCacheStore(redis);

    try {
      const alice = await makeUser("alice");
      await addTodo(alice, "first");

      const started = Date.now();
      const response = await todosOf(alice);

      expect(response.status).toBe(200);
      expect(titles(response.body)).toEqual(["first"]);
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      await redis.close();
      quiet.mockRestore();
    }
  });
});

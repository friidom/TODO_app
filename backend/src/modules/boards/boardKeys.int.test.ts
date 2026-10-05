import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
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

interface Board {
  id: string;
  key_prefix: string;
}

interface Failure {
  error: { code: string; message: string };
}

async function createBoard(user: TestUser, title: string): Promise<Board> {
  const response = await client.post<Board>("/api/v1/boards", { title }, { token: user.token });

  if (response.status !== 201) {
    throw new Error(`create failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

function patchKey(user: TestUser, boardId: string, key_prefix: string) {
  return client.patch<Board & Failure>(
    `/api/v1/boards/${boardId}`,
    { key_prefix },
    { token: user.token },
  );
}

async function createCard(user: TestUser, boardId: string, title: string): Promise<number> {
  const status = await firstStatusOf(boardId);
  const response = await client.post<{ board_key: number }>(
    `/api/v1/boards/${boardId}/todos`,
    { title, status_id: status.id },
    { token: user.token },
  );

  if (response.status !== 201) {
    throw new Error(`card failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body.board_key;
}

function keysOf(boardId: string): Promise<string[]> {
  return prisma.board_keys
    .findMany({ where: { board_id: boardId }, orderBy: { key: "asc" } })
    .then((rows) => rows.map((row) => row.key));
}

describe("a new board's key", () => {
  it.each([
    ["API", "API"],
    ["My New Hobbies", "MNH"],
    ["Hobby", "HOB"],
  ])("derives %s → %s", async (title, expected) => {
    const alice = await makeUser("alice");

    expect((await createBoard(alice, title)).key_prefix).toBe(expected);
  });

  it("suffixes a key another board already has", async () => {
    const alice = await makeUser("alice");

    expect((await createBoard(alice, "My New Hobbies")).key_prefix).toBe("MNH");
    expect((await createBoard(alice, "My New Hobby")).key_prefix).toBe("MNH2");
    expect((await createBoard(alice, "Hobby")).key_prefix).toBe("HOB");
    expect((await createBoard(alice, "Hobbies")).key_prefix).toBe("HOB2");
  });

  it("is unique across accounts, including the board signup provisions", async () => {
    const [alice, bob] = [await makeUser("alice"), await makeUser("bob")];

    const keys = await prisma.boards.findMany({
      where: { id: { in: [alice.boardId, bob.boardId] } },
      select: { key_prefix: true },
    });

    expect(keys.map((row) => row.key_prefix).sort()).toEqual(["MB", "MB2"]);
  });

  it("gives concurrent creations of one title distinct keys", async () => {
    const alice = await makeUser("alice");

    const boards = await Promise.all(Array.from({ length: 8 }, () => createBoard(alice, "API")));
    const keys = boards.map((board) => board.key_prefix);

    expect(new Set(keys).size).toBe(8);
    expect(keys).toContain("API");
  });

  it("records the key it was given", async () => {
    const alice = await makeUser("alice");
    const board = await createBoard(alice, "Core API");

    expect(await keysOf(board.id)).toEqual(["CA"]);
  });

  it("never reissues a deleted board's key", async () => {
    const alice = await makeUser("alice");
    const first = await createBoard(alice, "API");

    await client.del(`/api/v1/boards/${first.id}`, undefined, { token: alice.token });

    expect((await createBoard(alice, "API")).key_prefix).toBe("API2");

    const tombstone = await prisma.board_keys.findUniqueOrThrow({ where: { key: "API" } });

    expect(tombstone.board_id).toBeNull();
  });
});

describe("changing a board's key", () => {
  it("stores the normalized key and returns it", async () => {
    const alice = await makeUser("alice");
    const response = await patchKey(alice, alice.boardId, "  hob ");

    expect(response.status).toBe(200);
    expect(response.body.key_prefix).toBe("HOB");

    const reread = await client.get<Board>(`/api/v1/boards/${alice.boardId}`, {
      token: alice.token,
    });

    expect(reread.body.key_prefix).toBe("HOB");
  });

  it("keeps the old key as the board's history", async () => {
    const alice = await makeUser("alice");

    await patchKey(alice, alice.boardId, "HOB");

    expect(await keysOf(alice.boardId)).toEqual(["HOB", "MB"]);
  });

  it("refuses a key another board has now", async () => {
    const alice = await makeUser("alice");
    const api = await createBoard(alice, "API");
    const response = await patchKey(alice, alice.boardId, "API");

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe("Board key API is already in use.");
    expect((await prisma.boards.findUniqueOrThrow({ where: { id: api.id } })).key_prefix).toBe(
      "API",
    );
  });

  it("refuses a key another board used to have", async () => {
    const [alice, bob] = [await makeUser("alice"), await makeUser("bob")];

    expect((await patchKey(alice, alice.boardId, "ZED")).status).toBe(200);

    const response = await patchKey(bob, bob.boardId, "MB");

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe("Board key MB is already in use.");
  });

  it("lets a board take back a key it used to have", async () => {
    const alice = await makeUser("alice");

    await patchKey(alice, alice.boardId, "ZED");

    const response = await patchKey(alice, alice.boardId, "MB");

    expect(response.status).toBe(200);
    expect(response.body.key_prefix).toBe("MB");
    expect(await keysOf(alice.boardId)).toEqual(["MB", "ZED"]);
  });

  it.each(["", "my hobbies", "MY-HOBBIES", "@#$", "2FA", "ABCDEFGHIJK"])(
    "refuses %j",
    async (key) => {
      const alice = await makeUser("alice");

      expect((await patchKey(alice, alice.boardId, key)).status).toBe(400);
    },
  );

  it("is admin and above", async () => {
    const [alice, eddie] = [await makeUser("alice"), await makeUser("eddie")];

    await addMember(alice.boardId, eddie, "editor", alice.id);

    expect((await patchKey(eddie, alice.boardId, "HOB")).status).toBe(403);
  });
});

describe("task keys", () => {
  it("number per board, independently", async () => {
    const alice = await makeUser("alice");
    const [api, hob] = [await createBoard(alice, "API"), await createBoard(alice, "Hobby")];

    const apiKeys = [];
    const hobKeys = [];

    for (const n of [1, 2, 3]) apiKeys.push(await createCard(alice, api.id, `api ${n}`));
    for (const n of [1, 2, 3]) hobKeys.push(await createCard(alice, hob.id, `hob ${n}`));

    expect(apiKeys).toEqual([1, 2, 3]);
    expect(hobKeys).toEqual([1, 2, 3]);
    expect(await createCard(alice, api.id, "api 4")).toBe(4);
  });

  it("are never duplicated by concurrent creation", async () => {
    const alice = await makeUser("alice");

    const keys = await Promise.all(
      Array.from({ length: 10 }, (_, n) => createCard(alice, alice.boardId, `card ${n}`)),
    );

    expect([...keys].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("keep their numbers when the key changes, and new ones continue", async () => {
    const alice = await makeUser("alice");
    const board = await createBoard(alice, "My New Hobbies");

    for (const n of [1, 2, 3]) await createCard(alice, board.id, `card ${n}`);

    await patchKey(alice, board.id, "HOB");

    const numbers = await prisma.todos.findMany({
      where: { board_id: board.id },
      select: { board_key: true },
      orderBy: { board_key: "asc" },
    });

    expect(numbers.map((row) => row.board_key)).toEqual([1, 2, 3]);
    expect(await createCard(alice, board.id, "card 4")).toBe(4);
    expect(await keysOf(board.id)).toEqual(["HOB", "MNH"]);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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

interface Card {
  id: string;
  board_key: number;
}

interface Resolved {
  board_id: string;
  todo_id: string;
  key: string;
}

const NOT_FOUND = { error: { code: "not_found", message: "Not found." } };

async function createBoard(user: TestUser, title: string): Promise<{ id: string; key_prefix: string }> {
  const response = await client.post<{ id: string; key_prefix: string }>(
    "/api/v1/boards",
    { title },
    { token: user.token },
  );

  if (response.status !== 201) {
    throw new Error(`create failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

async function createCard(
  user: TestUser,
  boardId: string,
  extra: Record<string, unknown> = {},
): Promise<Card> {
  const status = await firstStatusOf(boardId);
  const response = await client.post<Card>(
    `/api/v1/boards/${boardId}/todos`,
    { title: "card", status_id: status.id, ...extra },
    { token: user.token },
  );

  if (response.status !== 201) {
    throw new Error(`card failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

function resolveRef(user: TestUser, ref: string) {
  return client.get<Resolved>(`/api/v1/task-refs/${encodeURIComponent(ref)}`, {
    token: user.token,
  });
}

describe("GET /task-refs/:ref", () => {
  it("resolves a current key to the card and nothing more", async () => {
    const alice = await makeUser("alice");
    const board = await createBoard(alice, "API");

    await createCard(alice, board.id);
    const card = await createCard(alice, board.id);

    const response = await resolveRef(alice, `API-${card.board_key}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      board_id: board.id,
      todo_id: card.id,
      key: `API-${card.board_key}`,
    });
  });

  it("normalizes a lowercase reference", async () => {
    const alice = await makeUser("alice");
    const board = await createBoard(alice, "API");
    const card = await createCard(alice, board.id);

    const response = await resolveRef(alice, `api-${card.board_key}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ todo_id: card.id, key: `API-${card.board_key}` });
  });

  it("resolves the old and the new key to the same card after a rename", async () => {
    const alice = await makeUser("alice");
    const board = await createBoard(alice, "My New Hobbies");

    expect(board.key_prefix).toBe("MNH");

    const card = await createCard(alice, board.id);
    const renamed = await client.patch(
      `/api/v1/boards/${board.id}`,
      { key_prefix: "HOB" },
      { token: alice.token },
    );

    expect(renamed.status).toBe(200);

    const before = await resolveRef(alice, `MNH-${card.board_key}`);
    const after = await resolveRef(alice, `HOB-${card.board_key}`);

    expect(before.status).toBe(200);
    expect(after.status).toBe(200);
    expect(before.body).toEqual(after.body);
    expect(before.body).toEqual({
      board_id: board.id,
      todo_id: card.id,
      key: `HOB-${card.board_key}`,
    });
  });

  it("never resolves one board's number on another board", async () => {
    const alice = await makeUser("alice");
    const api = await createBoard(alice, "API");
    const mnh = await createBoard(alice, "My New Hobbies");

    const apiCard = await createCard(alice, api.id);
    const mnhCard = await createCard(alice, mnh.id);

    expect(apiCard.board_key).toBe(mnhCard.board_key);

    const apiRef = await resolveRef(alice, `API-${apiCard.board_key}`);
    const mnhRef = await resolveRef(alice, `MNH-${mnhCard.board_key}`);

    expect(apiRef.body).toMatchObject({ board_id: api.id, todo_id: apiCard.id });
    expect(mnhRef.body).toMatchObject({ board_id: mnh.id, todo_id: mnhCard.id });
  });

  it("resolves a subtask by its own number", async () => {
    const alice = await makeUser("alice");
    const board = await createBoard(alice, "API");
    const parent = await createCard(alice, board.id);
    const subtask = await createCard(alice, board.id, { parent_id: parent.id });

    const response = await resolveRef(alice, `API-${subtask.board_key}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ board_id: board.id, todo_id: subtask.id });
  });

  it("resolves for any member, whatever their role", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const board = await createBoard(alice, "API");
    const card = await createCard(alice, board.id);

    await addMember(board.id, bob, "viewer", alice.id);

    const response = await resolveRef(bob, `API-${card.board_key}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ todo_id: card.id });
  });

  it("requires a session", async () => {
    const response = await client.get("/api/v1/task-refs/API-1");

    expect(response.status).toBe(401);
  });

  describe("answers one identical 404", () => {
    it("for a number the board never reached", async () => {
      const alice = await makeUser("alice");

      await createBoard(alice, "API");

      const response = await resolveRef(alice, "API-999999");

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    });

    it("for a key no board has held", async () => {
      const alice = await makeUser("alice");

      const response = await resolveRef(alice, "ZZZ-1");

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    });

    it("for a deleted board, even after another board is created", async () => {
      const alice = await makeUser("alice");
      const board = await createBoard(alice, "API");
      const card = await createCard(alice, board.id);

      const deleted = await client.del(`/api/v1/boards/${board.id}`, undefined, {
        token: alice.token,
      });

      expect(deleted.status).toBe(204);

      const replacement = await createBoard(alice, "API");
      await createCard(alice, replacement.id);

      expect(replacement.key_prefix).not.toBe("API");

      const response = await resolveRef(alice, `API-${card.board_key}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    });

    it("for a deleted card", async () => {
      const alice = await makeUser("alice");
      const board = await createBoard(alice, "API");
      const card = await createCard(alice, board.id);

      const deleted = await client.del(`/api/v1/todos/${card.id}`, undefined, {
        token: alice.token,
      });

      expect(deleted.status).toBe(204);

      const response = await resolveRef(alice, `API-${card.board_key}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    });

    it("for a real card on a board the caller is not on", async () => {
      const alice = await makeUser("alice");
      const mallory = await makeUser("mallory");
      const board = await createBoard(alice, "API");
      const card = await createCard(alice, board.id);

      const real = await resolveRef(mallory, `API-${card.board_key}`);
      const fake = await resolveRef(mallory, "API-999999");

      expect(real.status).toBe(404);
      expect(real.body).toEqual(NOT_FOUND);
      expect(fake.body).toEqual(real.body);
    });

    it.each(["API", "23", "API-", "-23", "API-abc", "API--23", "API-0", "API-023", "A-1", "API 1"])(
      "for the malformed reference %j",
      async (ref) => {
        const alice = await makeUser("alice");

        await createBoard(alice, "API");

        const response = await resolveRef(alice, ref);

        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_FOUND);
      },
    );
  });
});

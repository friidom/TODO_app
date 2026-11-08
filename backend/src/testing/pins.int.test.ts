import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../db/prisma.js";
import { disconnect, resetDatabase } from "./db.js";
import { addMember, makeUser, type TestUser } from "./fixtures.js";
import { startTestServer, type TestClient } from "./httpClient.js";

let client: TestClient;

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(resetDatabase);

afterAll(async () => {
  await client.close();
  await disconnect();
});

interface Pinnable {
  id: string;
  pinned_at: string | null;
  updated_at?: string;
}

async function makeTodo(actor: TestUser, boardId: string): Promise<string> {
  const response = await client.post<{ id: string }>(
    `/api/v1/boards/${boardId}/todos`,
    { title: "Card" },
    { token: actor.token },
  );

  return response.body.id;
}

async function makeComment(actor: TestUser, todoId: string, content = "hi"): Promise<Pinnable> {
  const response = await client.post<Pinnable>(
    `/api/v1/todos/${todoId}/comments`,
    { content },
    { token: actor.token },
  );

  return response.body;
}

// Rows written directly: pinning never touches storage.
async function makeFile(actor: TestUser, boardId: string, todoId: string): Promise<string> {
  const id = randomUUID();

  await prisma.attachments.create({
    data: {
      id,
      board_id: boardId,
      todo_id: todoId,
      uploader_id: actor.id,
      filename: "a.txt",
      storage_path: `${boardId}/${todoId}/${id}.txt`,
      size_bytes: 1,
      mime_type: "text/plain",
    },
  });

  return id;
}

const pinComment = (actor: TestUser, id: string) =>
  client.put<Pinnable>(`/api/v1/comments/${id}/pin`, undefined, { token: actor.token });

const unpinComment = (actor: TestUser, id: string) =>
  client.del<Pinnable>(`/api/v1/comments/${id}/pin`, undefined, { token: actor.token });

const pinFile = (actor: TestUser, todoId: string, id: string) =>
  client.put<Pinnable>(`/api/v1/todos/${todoId}/attachments/${id}/pin`, undefined, {
    token: actor.token,
  });

describe("pinning comments", () => {
  it("pins and unpins without marking the comment edited", async () => {
    const owner = await makeUser("owner");
    const todoId = await makeTodo(owner, owner.boardId);
    const comment = await makeComment(owner, todoId);

    const pinned = await pinComment(owner, comment.id);

    expect(pinned.status).toBe(200);
    expect(pinned.body.pinned_at).not.toBeNull();
    expect(pinned.body.updated_at).toBe(comment.updated_at);

    const thread = await client.get<Pinnable[]>(`/api/v1/todos/${todoId}/comments`, {
      token: owner.token,
    });

    expect(thread.body[0]!.pinned_at).not.toBeNull();
    expect((await unpinComment(owner, comment.id)).body.pinned_at).toBeNull();
    expect((await unpinComment(owner, comment.id)).status).toBe(200);
  });

  it("lets a viewer see pins but not change them", async () => {
    const owner = await makeUser("owner");
    const viewer = await makeUser("viewer");

    await addMember(owner.boardId, viewer, "viewer", owner.id);

    const todoId = await makeTodo(owner, owner.boardId);
    const comment = await makeComment(owner, todoId);

    await pinComment(owner, comment.id);

    expect((await pinComment(viewer, comment.id)).status).toBe(403);
    expect((await unpinComment(viewer, comment.id)).status).toBe(403);

    const thread = await client.get<Pinnable[]>(`/api/v1/todos/${todoId}/comments`, {
      token: viewer.token,
    });

    expect(thread.body[0]!.pinned_at).not.toBeNull();
  });

  it("answers a non-member 404", async () => {
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");
    const todoId = await makeTodo(owner, owner.boardId);
    const comment = await makeComment(owner, todoId);

    expect((await pinComment(stranger, comment.id)).status).toBe(404);
  });

  it("caps a work item at five, even when the pins race", async () => {
    const owner = await makeUser("owner");
    const todoId = await makeTodo(owner, owner.boardId);
    const comments = [];

    for (let i = 0; i < 7; i += 1) comments.push(await makeComment(owner, todoId, `c${i}`));

    const results = await Promise.all(comments.map((c) => pinComment(owner, c.id)));

    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(JSON.stringify(results.find((r) => r.status === 409)!.body)).toContain("Unpin one first");
    expect(await prisma.comment_pins.count()).toBe(5);
  });

  it("goes with the comment", async () => {
    const owner = await makeUser("owner");
    const todoId = await makeTodo(owner, owner.boardId);
    const comment = await makeComment(owner, todoId);

    await pinComment(owner, comment.id);
    await client.del(`/api/v1/comments/${comment.id}`, undefined, { token: owner.token });

    expect(await prisma.comment_pins.count()).toBe(0);
  });
});

describe("pinning files", () => {
  it("pins a file and lists it pinned", async () => {
    const owner = await makeUser("owner");
    const todoId = await makeTodo(owner, owner.boardId);
    const fileId = await makeFile(owner, owner.boardId, todoId);

    expect((await pinFile(owner, todoId, fileId)).body.pinned_at).not.toBeNull();

    const list = await client.get<Pinnable[]>(`/api/v1/todos/${todoId}/attachments`, {
      token: owner.token,
    });

    expect(list.body[0]!.pinned_at).not.toBeNull();
  });

  it("refuses a file named under another work item", async () => {
    const owner = await makeUser("owner");
    const todoId = await makeTodo(owner, owner.boardId);
    const otherTodo = await makeTodo(owner, owner.boardId);
    const fileId = await makeFile(owner, owner.boardId, otherTodo);

    expect((await pinFile(owner, todoId, fileId)).status).toBe(404);
  });

  it("refuses a viewer and caps at five", async () => {
    const owner = await makeUser("owner");
    const viewer = await makeUser("viewer");

    await addMember(owner.boardId, viewer, "viewer", owner.id);

    const todoId = await makeTodo(owner, owner.boardId);
    const files = [];

    for (let i = 0; i < 6; i += 1) files.push(await makeFile(owner, owner.boardId, todoId));

    expect((await pinFile(viewer, todoId, files[0]!)).status).toBe(403);

    for (const id of files.slice(0, 5)) {
      expect((await pinFile(owner, todoId, id)).status).toBe(200);
    }

    expect((await pinFile(owner, todoId, files[5]!)).status).toBe(409);
  });
});

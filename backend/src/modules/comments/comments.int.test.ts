import { randomUUID } from "node:crypto";

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

interface Comment {
  id: string;
  board_id: string;
  todo_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

async function board(roles: ("viewer" | "editor" | "admin")[] = []) {
  const owner = await makeUser("owner");
  const column = await firstColumnOf(owner.boardId);
  const members: Record<string, TestUser> = {};

  for (const role of roles) {
    const user = await makeUser(role);

    await addMember(owner.boardId, user, role, owner.id);
    members[role] = user;
  }

  const todo = await client.post<{ id: string }>(
    `/api/v1/boards/${owner.boardId}/todos`,
    { title: "Card", column_id: column.id },
    { token: owner.token },
  );

  return { owner, boardId: owner.boardId, todoId: todo.body.id, members };
}

function commentsUrl(todoId: string): string {
  return `/api/v1/todos/${todoId}/comments`;
}

async function comment(actor: TestUser, todoId: string, content: string): Promise<Comment> {
  const response = await client.post<Comment>(
    commentsUrl(todoId),
    { content },
    { token: actor.token },
  );

  if (response.status !== 201) {
    throw new Error(`comment failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

describe("GET /todos/:todoId/comments", () => {
  it("returns a thread oldest first", async () => {
    const { owner, todoId } = await board();

    await comment(owner, todoId, "first");
    await comment(owner, todoId, "second");
    await comment(owner, todoId, "third");

    const response = await client.get<Comment[]>(commentsUrl(todoId), { token: owner.token });

    expect(response.status).toBe(200);
    expect(response.body.map((c) => c.content)).toEqual(["first", "second", "third"]);
  });

  it("answers 404 for a non-member", async () => {
    const { todoId } = await board();
    const outsider = await makeUser("outsider");

    expect((await client.get(commentsUrl(todoId), { token: outsider.token })).status).toBe(404);
  });

  it("does not leak another card's comments", async () => {
    const { owner, boardId, todoId } = await board();
    const column = await firstColumnOf(boardId);
    const other = await client.post<{ id: string }>(
      `/api/v1/boards/${boardId}/todos`,
      { title: "Other", column_id: column.id },
      { token: owner.token },
    );

    await comment(owner, todoId, "on the first card");

    const response = await client.get<Comment[]>(commentsUrl(other.body.id), {
      token: owner.token,
    });

    expect(response.body).toHaveLength(0);
  });
});

describe("POST /todos/:todoId/comments", () => {
  // canComment is true for every role including viewer, which is where comments
  // and attachments deliberately disagree.
  it("lets a VIEWER comment", async () => {
    const { todoId, members } = await board(["viewer"]);

    const response = await client.post<Comment>(
      commentsUrl(todoId),
      { content: "a viewer's thought" },
      { token: members.viewer!.token },
    );

    expect(response.status).toBe(201);
    expect(response.body.author_id).toBe(members.viewer!.id);
  });

  it("sets author_id and board_id server-side, ignoring the body", async () => {
    const { owner, boardId, todoId } = await board();
    const stranger = await makeUser("stranger");

    const response = await client.post<Comment>(
      commentsUrl(todoId),
      { content: "mine", author_id: stranger.id, board_id: stranger.boardId },
      { token: owner.token },
    );

    expect(response.body.author_id).toBe(owner.id);
    expect(response.body.board_id).toBe(boardId);
  });

  it("honours a client-minted id", async () => {
    const { owner, todoId } = await board();
    const id = randomUUID();

    const response = await client.post<Comment>(
      commentsUrl(todoId),
      { id, content: "minted" },
      { token: owner.token },
    );

    expect(response.body.id).toBe(id);
  });

  it("rejects blank content, which the CHECK also refuses", async () => {
    const { owner, todoId } = await board();

    for (const content of ["", "   ", "\t\n"]) {
      const response = await client.post(commentsUrl(todoId), { content }, { token: owner.token });

      expect(response.status, JSON.stringify(content)).toBe(400);
    }
  });

  it("answers 404 for a card on another board", async () => {
    const { owner } = await board();
    const other = await board();

    const response = await client.post(
      commentsUrl(other.todoId),
      { content: "sneaky" },
      { token: owner.token },
    );

    expect(response.status).toBe(404);
  });
});

describe("PATCH /comments/:commentId", () => {
  it("lets the author edit their own", async () => {
    const { owner, todoId } = await board();
    const existing = await comment(owner, todoId, "before");

    const response = await client.patch<Comment>(
      `/api/v1/comments/${existing.id}`,
      { content: "after" },
      { token: owner.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.content).toBe("after");
  });

  // No rank widens this: rewriting someone's words is not moderation.
  it("REFUSES another editor, and refuses an admin and the owner too", async () => {
    const { boardId, todoId, members } = await board(["editor", "admin"]);
    const owner = await prisma.boards.findUniqueOrThrow({
      where: { id: boardId },
      select: { owner_id: true },
    });
    const existing = await comment(members.editor!, todoId, "the editor's words");

    const ownerUser = await prisma.profiles.findUniqueOrThrow({
      where: { id: owner.owner_id },
      select: { id: true },
    });

    expect(ownerUser.id).toBe(owner.owner_id);

    const byAdmin = await client.patch(
      `/api/v1/comments/${existing.id}`,
      { content: "rewritten" },
      { token: members.admin!.token },
    );

    expect(byAdmin.status).toBe(403);

    const row = await prisma.comments.findUniqueOrThrow({
      where: { id: existing.id },
      select: { content: true },
    });

    expect(row.content).toBe("the editor's words");
  });

  // Replaces `grant update (content)`: without the whitelist an author editing
  // their own comment could also backdate it or move it to another card.
  it("writes content and nothing else, whatever the body carries", async () => {
    const { owner, todoId } = await board();
    const other = await board();
    const existing = await comment(owner, todoId, "before");
    const original = await prisma.comments.findUniqueOrThrow({
      where: { id: existing.id },
      select: { created_at: true, todo_id: true, board_id: true, author_id: true },
    });

    await client.patch(
      `/api/v1/comments/${existing.id}`,
      {
        content: "after",
        created_at: "2000-01-01T00:00:00Z",
        todo_id: other.todoId,
        board_id: other.boardId,
        author_id: other.owner.id,
      },
      { token: owner.token },
    );

    const after = await prisma.comments.findUniqueOrThrow({
      where: { id: existing.id },
      select: { content: true, created_at: true, todo_id: true, board_id: true, author_id: true },
    });

    expect(after.content).toBe("after");
    expect(after.created_at.getTime()).toBe(original.created_at.getTime());
    expect(after.todo_id).toBe(original.todo_id);
    expect(after.board_id).toBe(original.board_id);
    expect(after.author_id).toBe(original.author_id);
  });

  it("cannot reach a comment on another board", async () => {
    const { owner } = await board();
    const other = await board();
    const theirs = await comment(other.owner, other.todoId, "theirs");

    const response = await client.patch(
      `/api/v1/comments/${theirs.id}`,
      { content: "stolen" },
      { token: owner.token },
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /comments/:commentId", () => {
  it("lets the author delete their own", async () => {
    const { todoId, members } = await board(["editor"]);
    const existing = await comment(members.editor!, todoId, "mine");

    expect(
      (await client.del(`/api/v1/comments/${existing.id}`, undefined, {
        token: members.editor!.token,
      })).status,
    ).toBe(204);
    expect(await prisma.comments.count({ where: { id: existing.id } })).toBe(0);
  });

  // canDeleteComment: admin+ moderates, the author deletes their own, and an
  // editor may do neither to someone else's.
  it("lets an ADMIN delete someone else's, and refuses an editor", async () => {
    const { todoId, members } = await board(["editor", "admin", "viewer"]);
    const first = await comment(members.viewer!, todoId, "a viewer's words");
    const second = await comment(members.viewer!, todoId, "and more");

    expect(
      (await client.del(`/api/v1/comments/${first.id}`, undefined, {
        token: members.editor!.token,
      })).status,
    ).toBe(403);

    expect(
      (await client.del(`/api/v1/comments/${second.id}`, undefined, {
        token: members.admin!.token,
      })).status,
    ).toBe(204);
  });

  it("answers 404 for a comment on another board", async () => {
    const { owner } = await board();
    const other = await board();
    const theirs = await comment(other.owner, other.todoId, "theirs");

    expect(
      (await client.del(`/api/v1/comments/${theirs.id}`, undefined, { token: owner.token }))
        .status,
    ).toBe(404);
    expect(await prisma.comments.count({ where: { id: theirs.id } })).toBe(1);
  });

  it("goes with the card when the card is deleted", async () => {
    const { owner, todoId } = await board();

    await comment(owner, todoId, "doomed");
    await client.del(`/api/v1/todos/${todoId}`, undefined, { token: owner.token });

    expect(await prisma.comments.count({ where: { todo_id: todoId } })).toBe(0);
  });
});

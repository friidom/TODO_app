import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, firstColumnOf, makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";
import { MAX_ATTACHMENT_BYTES } from "./attachments.upload.js";

// The storage boundary is stubbed so this suite still needs only a database.
// What is under test is authorization, the attachment-to-todo relationship and
// the order the two stores are written in — not somebody else's S3 client.
const storage = vi.hoisted(() => ({
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  failDeleteOnce: false,
}));

vi.mock("../../infrastructure/storage/minio-storage.js", () => ({
  minioStorage: {
    upload: async (name: string, body: Uint8Array, contentType: string) => {
      storage.objects.set(name, { body, contentType });
    },
    download: async (name: string) => {
      const object = storage.objects.get(name);

      if (object === undefined) throw new Error(`NoSuchKey: ${name}`);

      const { Readable } = await import("node:stream");

      return Readable.from(object.body);
    },
    delete: async (name: string) => {
      if (storage.failDeleteOnce) {
        storage.failDeleteOnce = false;

        throw new Error("storage unavailable");
      }

      storage.objects.delete(name);
    },
    exists: async (name: string) => storage.objects.has(name),
  },
}));

let client: TestClient;

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(async () => {
  await resetDatabase();
  storage.objects.clear();
  storage.failDeleteOnce = false;
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

interface Attachment {
  id: string;
  board_id: string;
  todo_id: string;
  uploader_id: string | null;
  filename: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
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

  return { owner, boardId: owner.boardId, todoId: todo.body.id, members, columnId: column.id };
}

function url(todoId: string, suffix = ""): string {
  return `/api/v1/todos/${todoId}/attachments${suffix}`;
}

function form(name: string, body: Uint8Array<ArrayBuffer> | string, type = "text/plain"): FormData {
  const data = new FormData();

  data.append("file", new Blob([body], { type }), name);

  return data;
}

async function attach(
  actor: TestUser,
  todoId: string,
  name = "notes.txt",
  body: Uint8Array<ArrayBuffer> | string = "hello",
  type = "text/plain",
): Promise<Attachment> {
  const response = await client.postForm<Attachment>(url(todoId), form(name, body, type), {
    token: actor.token,
  });

  if (response.status !== 201) {
    throw new Error(`upload failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return response.body;
}

describe("POST /todos/:todoId/attachments", () => {
  it("stores the object and the row, stamping board and uploader server-side", async () => {
    const { owner, boardId, todoId } = await board();

    const created = await attach(owner, todoId, "reze (2).jpg", "bytes", "image/jpeg");

    expect(created.board_id).toBe(boardId);
    expect(created.uploader_id).toBe(owner.id);
    expect(created.filename).toBe("reze (2).jpg");
    expect(created.mime_type).toBe("image/jpeg");
    expect(storage.objects.has(created.storage_path)).toBe(true);
  });

  // The policy boundary: the first path segment is the board.
  it("builds a key from ids only, whatever the filename is", async () => {
    const { owner, boardId, todoId } = await board();

    const created = await attach(owner, todoId, "../../../etc/passwd.png", "x", "image/png");

    expect(created.storage_path).toBe(`${boardId}/${todoId}/${created.id}.png`);
  });

  // canAttach is editor+, which is where attachments and comments disagree.
  it("REFUSES a viewer, who may comment but not attach", async () => {
    const { todoId, members } = await board(["viewer"]);

    const response = await client.postForm(url(todoId), form("x.txt", "x"), {
      token: members.viewer!.token,
    });

    expect(response.status).toBe(403);
    expect(storage.objects.size).toBe(0);
  });

  it("answers 404 for a non-member and 401 with no token", async () => {
    const { todoId } = await board();
    const outsider = await makeUser("outsider");

    expect(
      (await client.postForm(url(todoId), form("x.txt", "x"), { token: outsider.token })).status,
    ).toBe(404);

    expect((await client.postForm(url(todoId), form("x.txt", "x"))).status).toBe(401);
    expect(storage.objects.size).toBe(0);
  });

  it("answers 400 when no file is attached", async () => {
    const { owner, todoId } = await board();

    const response = await client.postForm(url(todoId), new FormData(), {
      token: owner.token,
    });

    expect(response.status).toBe(400);
  });

  it("answers 400 rather than 500 for a file over the limit", async () => {
    const { owner, todoId } = await board();
    const tooBig = new Uint8Array(MAX_ATTACHMENT_BYTES + 1).fill(0x61);

    const response = await client.postForm<{ error: { message: string } }>(
      url(todoId),
      form("big.bin", tooBig, "application/octet-stream"),
      { token: owner.token },
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/larger than/i);
    expect(storage.objects.size).toBe(0);
  });

  it("answers 404 for a card on another board", async () => {
    const { owner } = await board();
    const other = await board();

    expect(
      (await client.postForm(url(other.todoId), form("x.txt", "x"), { token: owner.token }))
        .status,
    ).toBe(404);
  });
});

describe("GET /todos/:todoId/attachments", () => {
  it("returns this card's files newest first", async () => {
    const { owner, todoId } = await board();

    const first = await attach(owner, todoId, "first.txt");
    const second = await attach(owner, todoId, "second.txt");

    const response = await client.get<Attachment[]>(url(todoId), { token: owner.token });

    expect(response.status).toBe(200);
    expect(response.body.map((row) => row.id)).toEqual([second.id, first.id]);
  });

  it("lets a viewer read the list", async () => {
    const { owner, todoId, members } = await board(["viewer"]);

    await attach(owner, todoId);

    const response = await client.get<Attachment[]>(url(todoId), {
      token: members.viewer!.token,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
  });

  it("does not leak another card's files", async () => {
    const { owner, boardId, todoId, columnId } = await board();
    const other = await client.post<{ id: string }>(
      `/api/v1/boards/${boardId}/todos`,
      { title: "Other", column_id: columnId },
      { token: owner.token },
    );

    await attach(owner, todoId);

    const response = await client.get<Attachment[]>(url(other.body.id), { token: owner.token });

    expect(response.body).toHaveLength(0);
  });

  it("answers 404 for a non-member", async () => {
    const { todoId } = await board();
    const outsider = await makeUser("outsider");

    expect((await client.get(url(todoId), { token: outsider.token })).status).toBe(404);
  });
});

describe("GET /todos/:todoId/attachments/:attachmentId/content", () => {
  it("streams the bytes to a viewer as a download", async () => {
    const { owner, todoId, members } = await board(["viewer"]);
    const created = await attach(owner, todoId, "notes.txt", "the contents");

    const response = await fetch(`${client.url}${url(todoId, `/${created.id}/content`)}`, {
      headers: { authorization: `Bearer ${members.viewer!.token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("the contents");
    expect(response.headers.get("content-disposition")).toContain('attachment; filename="notes.txt"');
  });

  // The inline gate: a stored text/html must never come back as something a
  // browser will run, however the request asks for it.
  it("refuses to serve anything but an image or a PDF inline", async () => {
    const { owner, todoId } = await board();
    const created = await attach(owner, todoId, "evil.html", "<script>x</script>", "text/html");

    const response = await fetch(
      `${client.url}${url(todoId, `/${created.id}/content?disposition=inline`)}`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );

    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("serves an image inline when asked", async () => {
    const { owner, todoId } = await board();
    const created = await attach(owner, todoId, "shot.png", "png-bytes", "image/png");

    const response = await fetch(
      `${client.url}${url(todoId, `/${created.id}/content?disposition=inline`)}`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );

    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
  });

  it("answers 401 unauthenticated and 404 for a non-member", async () => {
    const { owner, todoId } = await board();
    const outsider = await makeUser("outsider");
    const created = await attach(owner, todoId);
    const path = url(todoId, `/${created.id}/content`);

    expect((await fetch(`${client.url}${path}`)).status).toBe(401);

    expect(
      (
        await fetch(`${client.url}${path}`, {
          headers: { authorization: `Bearer ${outsider.token}` },
        })
      ).status,
    ).toBe(404);
  });

  // boardAccess proves the two ids share a board, not that one hangs off the
  // other — that is the repo's (board, todo, attachment) scope.
  it("answers 404 for a file on a different card of the SAME board", async () => {
    const { owner, boardId, todoId, columnId } = await board();
    const other = await client.post<{ id: string }>(
      `/api/v1/boards/${boardId}/todos`,
      { title: "Other", column_id: columnId },
      { token: owner.token },
    );
    const created = await attach(owner, todoId);

    const response = await fetch(
      `${client.url}${url(other.body.id, `/${created.id}/content`)}`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /todos/:todoId/attachments/:attachmentId", () => {
  it("removes the object and the row", async () => {
    const { todoId, members } = await board(["editor"]);
    const created = await attach(members.editor!, todoId);

    const response = await client.del(url(todoId, `/${created.id}`), undefined, {
      token: members.editor!.token,
    });

    expect(response.status).toBe(204);
    expect(storage.objects.has(created.storage_path)).toBe(false);
    expect(await prisma.attachments.count({ where: { id: created.id } })).toBe(0);
  });

  // canDeleteAttachment: admin+ moderates, the uploader removes their own, and
  // an editor may do neither to someone else's.
  it("lets an ADMIN delete someone else's, and refuses another editor", async () => {
    const { owner, todoId, members } = await board(["editor", "admin"]);
    const first = await attach(owner, todoId, "one.txt");
    const second = await attach(owner, todoId, "two.txt");

    expect(
      (await client.del(url(todoId, `/${first.id}`), undefined, {
        token: members.editor!.token,
      })).status,
    ).toBe(403);

    expect(
      (await client.del(url(todoId, `/${second.id}`), undefined, {
        token: members.admin!.token,
      })).status,
    ).toBe(204);

    expect(storage.objects.has(first.storage_path)).toBe(true);
  });

  it("refuses a viewer", async () => {
    const { owner, todoId, members } = await board(["viewer"]);
    const created = await attach(owner, todoId);

    expect(
      (await client.del(url(todoId, `/${created.id}`), undefined, {
        token: members.viewer!.token,
      })).status,
    ).toBe(403);
  });

  it("answers 404 for a file on another card, leaving it alone", async () => {
    const { owner, boardId, todoId, columnId } = await board();
    const other = await client.post<{ id: string }>(
      `/api/v1/boards/${boardId}/todos`,
      { title: "Other", column_id: columnId },
      { token: owner.token },
    );
    const created = await attach(owner, todoId);

    expect(
      (await client.del(url(other.body.id, `/${created.id}`), undefined, { token: owner.token }))
        .status,
    ).toBe(404);
    expect(await prisma.attachments.count({ where: { id: created.id } })).toBe(1);
  });

  it("answers 404 for a file on another board", async () => {
    const { owner } = await board();
    const other = await board();
    const theirs = await attach(other.owner, other.todoId);

    expect(
      (await client.del(url(other.todoId, `/${theirs.id}`), undefined, { token: owner.token }))
        .status,
    ).toBe(404);
    expect(await prisma.attachments.count({ where: { id: theirs.id } })).toBe(1);
  });

  // Object first, then the row: a storage failure must leave a row that is
  // still visible and still deletable, never bytes nothing points at.
  it("keeps the row when the object cannot be removed", async () => {
    const { owner, todoId } = await board();
    const created = await attach(owner, todoId);

    storage.failDeleteOnce = true;

    const response = await client.del(url(todoId, `/${created.id}`), undefined, {
      token: owner.token,
    });

    expect(response.status).toBe(500);
    expect(await prisma.attachments.count({ where: { id: created.id } })).toBe(1);
  });

  it("goes with the card when the card is deleted", async () => {
    const { owner, todoId } = await board();

    await attach(owner, todoId);
    await client.del(`/api/v1/todos/${todoId}`, undefined, { token: owner.token });

    expect(await prisma.attachments.count({ where: { todo_id: todoId } })).toBe(0);
  });
});

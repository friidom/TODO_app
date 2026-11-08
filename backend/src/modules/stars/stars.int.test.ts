import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, makeUser } from "../../testing/fixtures.js";
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

interface Star {
  board_id: string;
  starred_at: string;
}

const starUrl = (boardId: string) => `/api/v1/boards/${boardId}/star`;

const mine = (token: string) => client.get<Star[]>("/api/v1/me/starred", { token });

describe("starring a board", () => {
  it("lets a viewer star, and lists it for them alone", async () => {
    const owner = await makeUser("owner");
    const viewer = await makeUser("viewer");

    await addMember(owner.boardId, viewer, "viewer", owner.id);

    const put = await client.put<Star>(starUrl(owner.boardId), undefined, { token: viewer.token });

    expect(put.status).toBe(200);
    expect(put.body.board_id).toBe(owner.boardId);
    expect((await mine(viewer.token)).body.map((s) => s.board_id)).toEqual([owner.boardId]);
    expect((await mine(owner.token)).body).toEqual([]);
  });

  it("is idempotent: two stars leave one row", async () => {
    const owner = await makeUser("owner");

    const [a, b] = await Promise.all([
      client.put(starUrl(owner.boardId), undefined, { token: owner.token }),
      client.put(starUrl(owner.boardId), undefined, { token: owner.token }),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await prisma.board_stars.count({ where: { board_id: owner.boardId } })).toBe(1);
  });

  it("answers a non-member 404 and writes nothing", async () => {
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");

    const put = await client.put(starUrl(owner.boardId), undefined, { token: stranger.token });

    expect(put.status).toBe(404);
    expect(await prisma.board_stars.count()).toBe(0);
  });

  it("refuses an unauthenticated caller", async () => {
    const owner = await makeUser("owner");

    expect((await client.put(starUrl(owner.boardId))).status).toBe(401);
    expect((await client.get("/api/v1/me/starred")).status).toBe(401);
  });

  it("unstars idempotently", async () => {
    const owner = await makeUser("owner");

    await client.put(starUrl(owner.boardId), undefined, { token: owner.token });

    expect((await client.del(starUrl(owner.boardId), undefined, { token: owner.token })).status).toBe(204);
    expect((await client.del(starUrl(owner.boardId), undefined, { token: owner.token })).status).toBe(204);
    expect((await mine(owner.token)).body).toEqual([]);
  });

  it("lists newest first", async () => {
    const owner = await makeUser("owner");
    const other = await makeUser("other");

    await addMember(other.boardId, owner, "editor", other.id);
    await client.put(starUrl(owner.boardId), undefined, { token: owner.token });
    await client.put(starUrl(other.boardId), undefined, { token: owner.token });

    expect((await mine(owner.token)).body.map((s) => s.board_id)).toEqual([
      other.boardId,
      owner.boardId,
    ]);
  });
});

describe("a star outlives nothing it depends on", () => {
  it("goes when the member is removed", async () => {
    const owner = await makeUser("owner");
    const editor = await makeUser("editor");

    await addMember(owner.boardId, editor, "editor", owner.id);
    await client.put(starUrl(owner.boardId), undefined, { token: editor.token });

    await prisma.board_members.delete({
      where: { board_id_user_id: { board_id: owner.boardId, user_id: editor.id } },
    });

    expect(await prisma.board_stars.count()).toBe(0);
    expect((await mine(editor.token)).body).toEqual([]);
  });

  it("goes when the board is deleted", async () => {
    const owner = await makeUser("owner");

    await client.put(starUrl(owner.boardId), undefined, { token: owner.token });
    await prisma.boards.delete({ where: { id: owner.boardId } });

    expect(await prisma.board_stars.count()).toBe(0);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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

const SAVED = {
  cardFields: ["summary", "key", "status", "assignee"],
  columnSize: "flexible",
  scroll: "board",
  hideDoneAfter: 7,
};

interface Board {
  view_settings: typeof SAVED | null;
}

const patch = (boardId: string, token: string, body: unknown) =>
  client.patch<Board>(`/api/v1/boards/${boardId}`, body, { token });

const read = (boardId: string, token: string) =>
  client.get<Board>(`/api/v1/boards/${boardId}`, { token });

describe("boards.view_settings", () => {
  it("is null until an admin saves it, then every member reads the saved view", async () => {
    const owner = await makeUser("owner");
    const viewer = await makeUser("viewer");
    await addMember(owner.boardId, viewer, "viewer", owner.id);

    expect((await read(owner.boardId, viewer.token)).body.view_settings).toBeNull();

    const saved = await patch(owner.boardId, owner.token, { view_settings: SAVED });

    expect(saved.status).toBe(200);
    expect(saved.body.view_settings).toEqual(SAVED);
    expect((await read(owner.boardId, viewer.token)).body.view_settings).toEqual(SAVED);
  });

  it("lets an admin save, and refuses an editor and a viewer", async () => {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");
    const editor = await makeUser("editor");
    const viewer = await makeUser("viewer");
    await addMember(owner.boardId, admin, "admin", owner.id);
    await addMember(owner.boardId, editor, "editor", owner.id);
    await addMember(owner.boardId, viewer, "viewer", owner.id);

    expect((await patch(owner.boardId, admin.token, { view_settings: SAVED })).status).toBe(200);
    expect((await patch(owner.boardId, editor.token, { view_settings: null })).status).toBe(403);
    expect((await patch(owner.boardId, viewer.token, { view_settings: null })).status).toBe(403);
    expect((await read(owner.boardId, owner.token)).body.view_settings).toEqual(SAVED);
  });

  it("answers a non-member 404", async () => {
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");

    expect((await patch(owner.boardId, stranger.token, { view_settings: SAVED })).status).toBe(404);
  });

  it("clears the saved view with null", async () => {
    const owner = await makeUser("owner");

    await patch(owner.boardId, owner.token, { view_settings: SAVED });
    const cleared = await patch(owner.boardId, owner.token, { view_settings: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.view_settings).toBeNull();
  });

  it("refuses a malformed view and leaves the saved one as it was", async () => {
    const owner = await makeUser("owner");
    await patch(owner.boardId, owner.token, { view_settings: SAVED });

    for (const bad of [
      { ...SAVED, columnSize: "huge" },
      { ...SAVED, hideDoneAfter: 2 },
      { ...SAVED, cardFields: ["summary", "summary"] },
      { ...SAVED, cardFields: ["<script>"] },
      ["not", "an", "object"],
    ]) {
      expect((await patch(owner.boardId, owner.token, { view_settings: bad })).status).toBe(400);
    }

    expect((await read(owner.boardId, owner.token)).body.view_settings).toEqual(SAVED);
  });
});

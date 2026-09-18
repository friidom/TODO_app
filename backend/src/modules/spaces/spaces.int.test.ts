import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser } from "../../testing/fixtures.js";
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

interface Space {
  id: string;
  owner_id: string;
  title: string;
}

describe("GET /spaces", () => {
  it("needs a token", async () => {
    expect((await client.get("/api/v1/spaces")).status).toBe(401);
  });

  it("returns the space provisioning created, and only the caller's", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];

    await client.post("/api/v1/spaces", { title: "Theirs" }, { token: mallory.token });

    const response = await client.get<Space[]>("/api/v1/spaces", { token: alice.token });

    expect(response.status).toBe(200);
    expect(response.body.every((s) => s.owner_id === alice.id)).toBe(true);
    expect(response.body.map((s) => s.title)).not.toContain("Theirs");
  });

  it("orders by title", async () => {
    const alice = await makeUser("alice");

    for (const title of ["Zulu", "Alpha", "Mike"]) {
      await client.post("/api/v1/spaces", { title }, { token: alice.token });
    }

    const response = await client.get<Space[]>("/api/v1/spaces", { token: alice.token });
    const titles = response.body.map((s) => s.title);

    expect(titles).toEqual([...titles].sort());
  });
});

describe("POST /spaces", () => {
  it("creates one owned by the caller", async () => {
    const alice = await makeUser("alice");
    const response = await client.post<Space>(
      "/api/v1/spaces",
      { title: "Personal" },
      { token: alice.token },
    );

    expect(response.status).toBe(201);
    expect(response.body.owner_id).toBe(alice.id);
    expect(response.body.title).toBe("Personal");
  });

  it("honours a client-minted id", async () => {
    const alice = await makeUser("alice");
    const id = randomUUID();
    const response = await client.post<Space>(
      "/api/v1/spaces",
      { id, title: "Minted" },
      { token: alice.token },
    );

    expect(response.body.id).toBe(id);
  });

  it("IGNORES owner_id in the body", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const response = await client.post<Space>(
      "/api/v1/spaces",
      { title: "Forged", owner_id: mallory.id },
      { token: alice.token },
    );

    expect(response.body.owner_id).toBe(alice.id);
  });

  it("enforces spaces_title_length at both ends", async () => {
    const alice = await makeUser("alice");

    expect(
      (await client.post("/api/v1/spaces", { title: "   " }, { token: alice.token })).status,
    ).toBe(400);
    expect(
      (await client.post("/api/v1/spaces", { title: "x".repeat(61) }, { token: alice.token }))
        .status,
    ).toBe(400);
    expect(
      (await client.post("/api/v1/spaces", { title: "x".repeat(60) }, { token: alice.token }))
        .status,
    ).toBe(201);
  });
});

describe("PATCH /spaces/:spaceId", () => {
  it("renames the caller's own space", async () => {
    const alice = await makeUser("alice");
    const created = await client.post<Space>(
      "/api/v1/spaces",
      { title: "Before" },
      { token: alice.token },
    );

    const response = await client.patch<Space>(
      `/api/v1/spaces/${created.body.id}`,
      { title: "After" },
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("After");
  });

  // A space has no membership, so "not yours" and "does not exist" are the same
  // answer here for the same reason boardAccess gives one for boards.
  it("answers 404 — not 403 — for someone else's space, identically to one that does not exist", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const theirs = await client.post<Space>(
      "/api/v1/spaces",
      { title: "Theirs" },
      { token: mallory.token },
    );

    const foreign = await client.patch(
      `/api/v1/spaces/${theirs.body.id}`,
      { title: "Stolen" },
      { token: alice.token },
    );
    const absent = await client.patch(
      `/api/v1/spaces/${randomUUID()}`,
      { title: "Stolen" },
      { token: alice.token },
    );

    expect(foreign.status).toBe(404);
    expect(JSON.stringify(foreign.body)).toBe(JSON.stringify(absent.body));
  });

  it("leaves the other owner's row untouched after a refused rename", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const theirs = await client.post<Space>(
      "/api/v1/spaces",
      { title: "Theirs" },
      { token: mallory.token },
    );

    await client.patch(
      `/api/v1/spaces/${theirs.body.id}`,
      { title: "Stolen" },
      { token: alice.token },
    );

    const row = await prisma.spaces.findUniqueOrThrow({
      where: { id: theirs.body.id },
      select: { title: true },
    });

    expect(row.title).toBe("Theirs");
  });

  it("rejects a malformed id as a bad request", async () => {
    const alice = await makeUser("alice");
    const response = await client.patch(
      "/api/v1/spaces/not-a-uuid",
      { title: "x" },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
  });
});

describe("DELETE /spaces/:spaceId", () => {
  it("deletes the caller's own space", async () => {
    const alice = await makeUser("alice");
    const created = await client.post<Space>(
      "/api/v1/spaces",
      { title: "Doomed" },
      { token: alice.token },
    );

    expect(
      (await client.del(`/api/v1/spaces/${created.body.id}`, undefined, { token: alice.token }))
        .status,
    ).toBe(204);
    expect(await prisma.spaces.count({ where: { id: created.body.id } })).toBe(0);
  });

  it("answers 404 for someone else's", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const theirs = await client.post<Space>(
      "/api/v1/spaces",
      { title: "Theirs" },
      { token: mallory.token },
    );

    expect(
      (await client.del(`/api/v1/spaces/${theirs.body.id}`, undefined, { token: alice.token }))
        .status,
    ).toBe(404);
    expect(await prisma.spaces.count({ where: { id: theirs.body.id } })).toBe(1);
  });

  // boards.space_id is ON DELETE SET NULL: deleting a folder unfiles its
  // boards, it does not delete them.
  it("unfiles the boards it held rather than deleting them", async () => {
    const alice = await makeUser("alice");
    const space = await client.post<Space>(
      "/api/v1/spaces",
      { title: "Folder" },
      { token: alice.token },
    );

    await client.patch(
      `/api/v1/boards/${alice.boardId}`,
      { space_id: space.body.id },
      { token: alice.token },
    );

    await client.del(`/api/v1/spaces/${space.body.id}`, undefined, { token: alice.token });

    const board = await prisma.boards.findUniqueOrThrow({
      where: { id: alice.boardId },
      select: { space_id: true },
    });

    expect(board.space_id).toBeNull();
  });
});

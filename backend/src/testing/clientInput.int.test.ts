import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../db/prisma.js";
import { disconnect, resetDatabase } from "./db.js";
import { makeUser } from "./fixtures.js";
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

const NUL = `a${String.fromCharCode(0)}b`;

// PostgreSQL cannot store a NUL byte in a text column, so every text field in
// the API was answering 500 to it. No input a client can send should do that.
describe("a NUL byte is a bad request, not a 500", () => {
  it("on every text field B7-A1 exposes", async () => {
    const alice = await makeUser("alice");

    const cases: [string, Promise<{ status: number }>][] = [
      ["POST /spaces", client.post("/api/v1/spaces", { title: NUL }, { token: alice.token })],
      ["PATCH /users/me", client.patch("/api/v1/users/me", { bio: NUL }, { token: alice.token })],
      [
        "PATCH /boards/:id",
        client.patch(
          `/api/v1/boards/${alice.boardId}`,
          { description: NUL },
          { token: alice.token },
        ),
      ],
      [
        "POST /boards",
        client.post("/api/v1/boards", { title: NUL }, { token: alice.token }),
      ],
    ];

    for (const [label, pending] of cases) {
      const response = await pending;

      expect(response.status, label).toBe(400);
    }
  });

  it("with the standard error shape", async () => {
    const alice = await makeUser("alice");
    const response = await client.post<{ error: { code: string; message: string } }>(
      "/api/v1/spaces",
      { title: NUL },
      { token: alice.token },
    );

    expect(response.body.error.code).toBe("bad_request");
    expect(response.body.error.message).toBeTruthy();
  });
});

describe("oversized and malformed bodies stay 4xx", () => {
  it("rejects a title past its length limit rather than truncating it", async () => {
    const alice = await makeUser("alice");
    const response = await client.post(
      "/api/v1/spaces",
      { title: "x".repeat(5000) },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
  });

  it("rejects a wrong-typed field", async () => {
    const alice = await makeUser("alice");

    for (const title of [42, true, { nested: "object" }, ["array"]]) {
      const response = await client.post("/api/v1/spaces", { title }, { token: alice.token });

      expect(response.status, JSON.stringify(title)).toBe(400);
    }
  });

  it("rejects an oversized body rather than crashing on it", async () => {
    const alice = await makeUser("alice");
    const response = await fetch(`${client.url}/api/v1/spaces`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${alice.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: "x".repeat(200_000) }),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("rejects a malformed JSON body", async () => {
    const alice = await makeUser("alice");
    const response = await fetch(`${client.url}/api/v1/spaces`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${alice.token}`,
        "content-type": "application/json",
      },
      body: "{not json",
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});

// Both reachable from an ordinary body, and both answered 500 before the
// SQLSTATE map learned them: 22007 for a date PostgreSQL cannot represent,
// 22003 for a number past the column width.
describe("values the database cannot hold are 4xx, not 500", () => {
  it("rejects a due_date PostgreSQL cannot represent", async () => {
    const alice = await makeUser("alice");
    const column = await prisma.columns.findFirstOrThrow({
      where: { board_id: alice.boardId },
      select: { id: true },
    });

    const response = await client.post(
      `/api/v1/boards/${alice.boardId}/todos`,
      { title: "x", column_id: column.id, due_date: "-000001-01-01T00:00:00Z" },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
  });

  it("rejects a sprint date PostgreSQL cannot represent", async () => {
    const alice = await makeUser("alice");

    const response = await client.post(
      `/api/v1/boards/${alice.boardId}/sprints`,
      { name: "S", start_date: "-000001-01-01T00:00:00Z" },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
  });

  it("rejects a column limit past int4", async () => {
    const alice = await makeUser("alice");
    const column = await prisma.columns.findFirstOrThrow({
      where: { board_id: alice.boardId },
      select: { id: true },
    });

    const response = await client.patch(
      `/api/v1/columns/${column.id}`,
      { max_limit: 1099511627776 },
      { token: alice.token },
    );

    expect(response.status).toBe(400);
  });

  it("still accepts an ordinary date and an ordinary limit", async () => {
    const alice = await makeUser("alice");
    const column = await prisma.columns.findFirstOrThrow({
      where: { board_id: alice.boardId },
      select: { id: true },
    });

    expect(
      (
        await client.post(
          `/api/v1/boards/${alice.boardId}/todos`,
          { title: "x", column_id: column.id, due_date: "2026-12-31T00:00:00Z" },
          { token: alice.token },
        )
      ).status,
    ).toBe(201);

    expect(
      (await client.patch(`/api/v1/columns/${column.id}`, { max_limit: 8 }, { token: alice.token }))
        .status,
    ).toBe(200);
  });
});

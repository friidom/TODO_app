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

interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  email?: unknown;
}

describe("GET /users/me", () => {
  it("needs a token", async () => {
    expect((await client.get("/api/v1/users/me")).status).toBe(401);
  });

  it("returns the caller's own profile", async () => {
    const alice = await makeUser("alice");
    const response = await client.get<Profile>("/api/v1/users/me", { token: alice.token });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(alice.id);
    expect(response.body.username).toBe(alice.username);
  });

  // profiles is self-only, and the roster is the only teammate-identity read.
  // A profile shape carrying email is how that boundary gets lost.
  it("never includes email", async () => {
    const alice = await makeUser("alice");
    const response = await client.get<Profile>("/api/v1/users/me", { token: alice.token });

    expect(response.body).not.toHaveProperty("email");
  });
});

describe("there is deliberately no GET /users/:userId", () => {
  it("does not expose another user's profile by id", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const response = await client.get(`/api/v1/users/${mallory.id}`, { token: alice.token });

    expect(response.status).toBe(404);
  });
});

describe("PATCH /users/me", () => {
  it("updates the display fields", async () => {
    const alice = await makeUser("alice");
    const response = await client.patch<Profile>(
      "/api/v1/users/me",
      { full_name: "Ada Lovelace", bio: "Analytical" },
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.full_name).toBe("Ada Lovelace");
    expect(response.body.bio).toBe("Analytical");
  });

  // This used to assert the opposite — that a body could set avatar_url to any
  // string. That was the hole: the value was the client's to choose, so an
  // account could point its avatar at another user's object, or at any url at
  // all. It now moves only through POST/DELETE /users/me/avatar.
  it("does not let the body set avatar_url", async () => {
    const alice = await makeUser("alice");

    const response = await client.patch<Profile>(
      "/api/v1/users/me",
      { full_name: "Ada", avatar_url: "https://evil.test/y.png" },
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.full_name).toBe("Ada");
    expect(response.body.avatar_url).toBeNull();
  });

  it("clears a nullable field when sent null", async () => {
    const alice = await makeUser("alice");

    await client.patch("/api/v1/users/me", { bio: "temporary" }, { token: alice.token });

    const response = await client.patch<Profile>(
      "/api/v1/users/me",
      { bio: null },
      { token: alice.token },
    );

    expect(response.body.bio).toBeNull();
  });

  it("renames the caller", async () => {
    const alice = await makeUser("alice");
    const response = await client.patch<Profile>(
      "/api/v1/users/me",
      { username: "ada_lovelace" },
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.username).toBe("ada_lovelace");
  });

  it("normalises a username to lower case before storing it", async () => {
    const alice = await makeUser("alice");
    const response = await client.patch<Profile>(
      "/api/v1/users/me",
      { username: "  AdaLovelace  " },
      { token: alice.token },
    );

    expect(response.body.username).toBe("adalovelace");
  });

  it("answers 409, not 500, when the username is taken", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const response = await client.patch<{ error: { code: string } }>(
      "/api/v1/users/me",
      { username: mallory.username },
      { token: alice.token },
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("conflict");
  });

  it("treats the case-insensitive unique index as taken too", async () => {
    const [alice, mallory] = [await makeUser("alice"), await makeUser("mallory")];
    const response = await client.patch(
      "/api/v1/users/me",
      { username: mallory.username.toUpperCase() },
      { token: alice.token },
    );

    expect(response.status).toBe(409);
  });

  it("rejects a username outside profiles_username_shape before it reaches the database", async () => {
    const alice = await makeUser("alice");

    for (const username of ["ab", "_leading", "has-a-dash", "x".repeat(31), "Ünïcode"]) {
      const response = await client.patch(
        "/api/v1/users/me",
        { username },
        { token: alice.token },
      );

      expect(response.status, username).toBe(400);
    }
  });

  it("IGNORES id and email in the patch", async () => {
    const alice = await makeUser("alice");
    const stolenId = randomUUID();

    const response = await client.patch<Profile>(
      "/api/v1/users/me",
      { full_name: "Ada", id: stolenId, email: "attacker@example.com" },
      { token: alice.token },
    );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(alice.id);

    const row = await prisma.profiles.findUniqueOrThrow({
      where: { id: alice.id },
      select: { email: true },
    });

    expect(row.email).toBe(alice.email);
  });

  it("rejects an empty patch", async () => {
    const alice = await makeUser("alice");

    expect((await client.patch("/api/v1/users/me", {}, { token: alice.token })).status).toBe(400);
  });

  it("needs a token", async () => {
    expect((await client.patch("/api/v1/users/me", { full_name: "x" })).status).toBe(401);
  });
});

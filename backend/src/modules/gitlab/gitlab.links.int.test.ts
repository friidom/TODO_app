import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { openSecret } from "../../lib/secretBox.js";
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

// vitest.integration.config.ts sets INTEGRATION_SECRET_KEY to these 32 bytes.
const KEY = Buffer.from("test-integration-key-32-bytes!!!");

interface Link {
  id: string;
  instance_url: string;
  project_path: string;
  project_url: string;
  webhook_url: string;
  status: string;
  signing_token_set_at: string | null;
  last_delivery_at: string | null;
}

interface Failure {
  error: { code: string; message: string };
}

function signingToken(): string {
  return `whsec_${randomBytes(32).toString("base64")}`;
}

function linksPath(boardId: string): string {
  return `/api/v1/boards/${boardId}/integrations/gitlab`;
}

function connect(user: TestUser, boardId: string, projectUrl: string) {
  return client.post<{ link: Link; webhook_url: string } & Failure>(
    linksPath(boardId),
    { project_url: projectUrl },
    { token: user.token },
  );
}

async function connected(user: TestUser, boardId = user.boardId, projectUrl = "https://gitlab.com/acme/backend") {
  const response = await connect(user, boardId, projectUrl);

  if (response.status !== 201) throw new Error(`connect failed: ${response.status} ${JSON.stringify(response.body)}`);

  return response.body.link;
}

function saveToken(user: TestUser, boardId: string, linkId: string, token: string) {
  return client.put<Link & Failure>(`${linksPath(boardId)}/${linkId}/signing-token`, { token }, { token: user.token });
}

async function sealedTokenOf(linkId: string): Promise<string | null> {
  const row = await prisma.board_gitlab_projects.findUniqueOrThrow({ where: { id: linkId } });

  return row.signing_token_sealed;
}

describe("connecting a GitLab project", () => {
  it("returns the link and the webhook url to give GitLab", async () => {
    const alice = await makeUser("alice");

    const response = await connect(alice, alice.boardId, "https://gitlab.com/Acme/Backend.git");

    expect(response.status).toBe(201);
    expect(response.body.webhook_url).toBe(
      `http://api.test/api/v1/integrations/gitlab/webhooks/${response.body.link.id}`,
    );
    expect(response.body.link).toMatchObject({
      instance_url: "https://gitlab.com",
      project_path: "Acme/Backend",
      project_url: "https://gitlab.com/Acme/Backend",
      webhook_url: response.body.webhook_url,
      status: "awaiting_token",
      signing_token_set_at: null,
      last_delivery_at: null,
    });
    expect(JSON.stringify(response.body)).not.toContain("sealed");
  });

  it("reads group/project as a GitLab.com project", async () => {
    const alice = await makeUser("alice");

    expect((await connected(alice, alice.boardId, "friidom/veylo-webhook-test")).project_url).toBe(
      "https://gitlab.com/friidom/veylo-webhook-test",
    );
  });

  it("refuses the same project twice on one board, ignoring case", async () => {
    const alice = await makeUser("alice");

    await connected(alice, alice.boardId, "https://gitlab.com/acme/backend");

    const again = await connect(alice, alice.boardId, "https://gitlab.com/ACME/Backend/");

    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("That GitLab project is already connected to this board.");
  });

  it("lets the same project be connected to another board", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");

    const first = await connected(alice);
    const second = await connected(bob);

    expect(second.id).not.toBe(first.id);
    expect(second.webhook_url).not.toBe(first.webhook_url);
  });

  it.each([
    ["http://gitlab.com/acme/backend", "project_url: must be an https:// address."],
    ["https://gitlab.com/backend", "project_url: must name a project, such as group/project."],
    ["https://user:secret@gitlab.com/acme/backend", "project_url: is not a GitLab project address."],
  ])("refuses %s", async (projectUrl, message) => {
    const alice = await makeUser("alice");

    const response = await connect(alice, alice.boardId, projectUrl);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(message);
    expect(await prisma.board_gitlab_projects.count()).toBe(0);
  });

  it("lists only this board's projects, oldest first", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");

    await connected(alice, alice.boardId, "acme/backend");
    await connected(alice, alice.boardId, "acme/frontend");
    await connected(bob, bob.boardId, "acme/mobile");

    const response = await client.get<Link[]>(linksPath(alice.boardId), { token: alice.token });

    expect(response.status).toBe(200);
    expect(response.body.map((link) => link.project_path)).toEqual(["acme/backend", "acme/frontend"]);
  });
});

describe("saving the signing token", () => {
  it("stores it sealed and never returns it", async () => {
    const alice = await makeUser("alice");
    const link = await connected(alice);
    const token = signingToken();

    const response = await saveToken(alice, alice.boardId, link.id, token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: link.id, status: "awaiting_delivery" });
    expect(response.body.signing_token_set_at).not.toBeNull();

    const listed = await client.get<Link[]>(linksPath(alice.boardId), { token: alice.token });

    for (const body of [JSON.stringify(response.body), JSON.stringify(listed.body)]) {
      expect(body).not.toContain(token);
      expect(body).not.toContain(token.slice("whsec_".length));
    }

    const sealed = await sealedTokenOf(link.id);

    expect(sealed).not.toContain(token.slice("whsec_".length));
    expect(openSecret(sealed!, KEY, `board_gitlab_projects:${link.id}`)).toBe(token);
  });

  it("trims a pasted token and replaces an earlier one", async () => {
    const alice = await makeUser("alice");
    const link = await connected(alice);
    const first = signingToken();
    const second = signingToken();

    await saveToken(alice, alice.boardId, link.id, first);

    const response = await saveToken(alice, alice.boardId, link.id, `  ${second}\n`);

    expect(response.status).toBe(200);
    expect(openSecret((await sealedTokenOf(link.id))!, KEY, `board_gitlab_projects:${link.id}`)).toBe(second);
  });

  it.each([
    ["no whsec_ prefix", randomBytes(32).toString("base64"), "token: must start with whsec_ — copy the whole signing token from GitLab."],
    ["characters outside base64", "whsec_this-is*not#base64", "token: is not a GitLab signing token."],
    ["too short", `whsec_${randomBytes(8).toString("base64")}`, "token: is not a GitLab signing token."],
    ["empty", "", "token: must start with whsec_ — copy the whole signing token from GitLab."],
  ])("refuses a token with %s and echoes none of it", async (_label, token, message) => {
    const alice = await makeUser("alice");
    const link = await connected(alice);

    const response = await saveToken(alice, alice.boardId, link.id, token);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(message);
    if (token !== "") expect(JSON.stringify(response.body)).not.toContain(token);
    expect(await sealedTokenOf(link.id)).toBeNull();
  });

  it("refuses to store a token when the server has no INTEGRATION_SECRET_KEY", async () => {
    const alice = await makeUser("alice");
    const link = await connected(alice);
    const writable = env as { INTEGRATION_SECRET_KEY?: string };
    const configured = writable.INTEGRATION_SECRET_KEY;

    writable.INTEGRATION_SECRET_KEY = undefined;

    try {
      const response = await saveToken(alice, alice.boardId, link.id, signingToken());

      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe("GitLab integration is not configured on this server.");
      expect(await sealedTokenOf(link.id)).toBeNull();
    } finally {
      writable.INTEGRATION_SECRET_KEY = configured;
    }
  });
});

describe("unlinking", () => {
  it("removes the project and every development record it brought", async () => {
    const alice = await makeUser("alice");
    const link = await connected(alice);
    const status = await firstStatusOf(alice.boardId);
    const card = await client.post<{ id: string }>(
      `/api/v1/boards/${alice.boardId}/todos`,
      { title: "card", status_id: status.id },
      { token: alice.token },
    );

    await prisma.todo_gitlab_commits.create({
      data: {
        board_id: alice.boardId,
        todo_id: card.body.id,
        link_id: link.id,
        sha: "74be48fbe4265f21e00b8aa93bb46614d720c4de",
        title: "MB-1 fix",
        message: "MB-1 fix",
        author_name: "Ada",
        committed_at: new Date(),
        matched_ref: "MB-1",
      },
    });

    const response = await client.del(`${linksPath(alice.boardId)}/${link.id}`, undefined, { token: alice.token });

    expect(response.status).toBe(204);
    expect(await prisma.board_gitlab_projects.count()).toBe(0);
    expect(await prisma.todo_gitlab_commits.count()).toBe(0);

    const again = await client.del(`${linksPath(alice.boardId)}/${link.id}`, undefined, { token: alice.token });

    expect(again.status).toBe(404);
  });
});

describe("who may manage GitLab projects", () => {
  async function scene() {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");
    const editor = await makeUser("editor");
    const viewer = await makeUser("viewer");
    const stranger = await makeUser("stranger");

    await addMember(owner.boardId, admin, "admin", owner.id);
    await addMember(owner.boardId, editor, "editor", owner.id);
    await addMember(owner.boardId, viewer, "viewer", owner.id);

    return { owner, admin, editor, viewer, stranger, link: await connected(owner) };
  }

  // In sequence, not in parallel: the save and the delete name the same link.
  async function attempts(user: TestUser, boardId: string, linkId: string): Promise<number[]> {
    return [
      (await client.get(linksPath(boardId), { token: user.token })).status,
      (await connect(user, boardId, "acme/another")).status,
      (await saveToken(user, boardId, linkId, signingToken())).status,
      (await client.del(`${linksPath(boardId)}/${linkId}`, undefined, { token: user.token })).status,
    ];
  }

  it("allows a board admin", async () => {
    const { owner, admin, link } = await scene();

    expect(await attempts(admin, owner.boardId, link.id)).toEqual([200, 201, 200, 204]);
  });

  it.each(["editor", "viewer"] as const)("refuses an %s with 403", async (role) => {
    const users = await scene();

    expect(await attempts(users[role], users.owner.boardId, users.link.id)).toEqual([403, 403, 403, 403]);
  });

  it("answers 404 to someone not on the board", async () => {
    const { owner, stranger, link } = await scene();

    expect(await attempts(stranger, owner.boardId, link.id)).toEqual([404, 404, 404, 404]);
  });

  it("answers 404 for a link that belongs to another board", async () => {
    const { owner, stranger, link } = await scene();

    const save = await saveToken(stranger, stranger.boardId, link.id, signingToken());
    const remove = await client.del(`${linksPath(stranger.boardId)}/${link.id}`, undefined, {
      token: stranger.token,
    });

    expect([save.status, remove.status]).toEqual([404, 404]);
    expect(await sealedTokenOf(link.id)).toBeNull();
    expect(await prisma.board_gitlab_projects.count({ where: { board_id: owner.boardId } })).toBe(1);
  });

  it("requires a session", async () => {
    const { owner, link } = await scene();

    const responses = [
      await client.get(linksPath(owner.boardId)),
      await client.post(linksPath(owner.boardId), { project_url: "acme/x" }),
      await client.put(`${linksPath(owner.boardId)}/${link.id}/signing-token`, { token: signingToken() }),
      await client.del(`${linksPath(owner.boardId)}/${link.id}`),
    ];

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
  });
});

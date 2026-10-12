import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { openSecret, sealSecret } from "../../lib/secretBox.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, firstStatusOf, makeUser, type TestUser } from "../../testing/fixtures.js";
import { spaceIdOf } from "../../testing/gitlab.js";
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

interface SpaceGitLab {
  configured: boolean;
  link: Link | null;
  board_links: (Link & { board: { id: string; title: string | null; key_prefix: string } })[];
}

interface Failure {
  error: { code: string; message: string };
}

function signingToken(): string {
  return `whsec_${randomBytes(32).toString("base64")}`;
}

function spacePath(spaceId: string): string {
  return `/api/v1/spaces/${spaceId}/integrations/gitlab`;
}

function boardPath(boardId: string): string {
  return `/api/v1/boards/${boardId}/integrations/gitlab`;
}

function connect(user: TestUser, spaceId: string, projectUrl: string) {
  return client.post<{ link: Link; webhook_url: string } & Failure>(
    spacePath(spaceId),
    { project_url: projectUrl },
    { token: user.token },
  );
}

async function connected(user: TestUser, projectUrl = "https://gitlab.com/acme/backend") {
  const spaceId = await spaceIdOf(user.boardId);
  const response = await connect(user, spaceId, projectUrl);

  if (response.status !== 201) throw new Error(`connect failed: ${response.status} ${JSON.stringify(response.body)}`);

  return { spaceId, link: response.body.link };
}

function saveToken(user: TestUser, spaceId: string, linkId: string, token: string) {
  return client.put<Link & Failure>(`${spacePath(spaceId)}/${linkId}/signing-token`, { token }, { token: user.token });
}

function read(user: TestUser, spaceId: string) {
  return client.get<SpaceGitLab>(spacePath(spaceId), { token: user.token });
}

function row(linkId: string) {
  return prisma.board_gitlab_projects.findUniqueOrThrow({ where: { id: linkId } });
}

// A link as 0034 made them, owned by one board. The API no longer creates
// these; 0036 leaves the ambiguous ones in place.
async function boardLink(boardId: string, createdBy: string, projectPath = "acme/legacy") {
  return prisma.board_gitlab_projects.create({
    data: { board_id: boardId, instance_url: "https://gitlab.com", project_path: projectPath, created_by: createdBy },
  });
}

describe("connecting a space to a GitLab project", () => {
  it("returns the link and the webhook url to give GitLab", async () => {
    const alice = await makeUser("alice");
    const spaceId = await spaceIdOf(alice.boardId);

    const response = await connect(alice, spaceId, "https://gitlab.com/Acme/Backend.git");

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
    expect(await row(response.body.link.id)).toMatchObject({ space_id: spaceId, board_id: null });
  });

  it("reads group/project as a GitLab.com project", async () => {
    const alice = await makeUser("alice");

    expect((await connected(alice, "friidom/veylo-webhook-test")).link.project_url).toBe(
      "https://gitlab.com/friidom/veylo-webhook-test",
    );
  });

  it("refuses the project the space already uses, ignoring case", async () => {
    const alice = await makeUser("alice");
    const { spaceId } = await connected(alice, "https://gitlab.com/acme/backend");

    const again = await connect(alice, spaceId, "https://gitlab.com/ACME/Backend/");

    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("That GitLab project is already connected to this space.");
  });

  it("changes the project by replacing the link: the old one is disconnected and its token wiped", async () => {
    const alice = await makeUser("alice");
    const { spaceId, link: first } = await connected(alice, "acme/backend");

    await saveToken(alice, spaceId, first.id, signingToken());

    const second = await connect(alice, spaceId, "acme/frontend");

    expect(second.status).toBe(201);
    expect((await read(alice, spaceId)).body.link).toMatchObject({ id: second.body.link.id, project_path: "acme/frontend" });
    expect(await row(first.id)).toMatchObject({ signing_token_sealed: null, signing_token_set_at: null });
    expect((await row(first.id)).disconnected_at).not.toBeNull();
  });

  it("lets the same project be connected to another space", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");

    const first = await connected(alice);
    const second = await connected(bob);

    expect(second.link.id).not.toBe(first.link.id);
    expect(second.link.webhook_url).not.toBe(first.link.webhook_url);
  });

  it.each([
    ["http://gitlab.com/acme/backend", "project_url: must be an https:// address."],
    ["https://gitlab.com/backend", "project_url: must name a project, such as group/project."],
    ["https://user:secret@gitlab.com/acme/backend", "project_url: is not a GitLab project address."],
  ])("refuses %s", async (projectUrl, message) => {
    const alice = await makeUser("alice");

    const response = await connect(alice, await spaceIdOf(alice.boardId), projectUrl);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(message);
    expect(await prisma.board_gitlab_projects.count()).toBe(0);
  });

  it("reads nothing connected yet, and says whether the server can store a signing token", async () => {
    const alice = await makeUser("alice");
    const spaceId = await spaceIdOf(alice.boardId);
    const writable = env as { INTEGRATION_SECRET_KEY?: string };
    const configured = writable.INTEGRATION_SECRET_KEY;

    expect((await read(alice, spaceId)).body).toEqual({ configured: true, link: null, board_links: [] });

    writable.INTEGRATION_SECRET_KEY = undefined;

    try {
      expect((await read(alice, spaceId)).body.configured).toBe(false);
    } finally {
      writable.INTEGRATION_SECRET_KEY = configured;
    }
  });
});

describe("saving the signing token", () => {
  it("stores it sealed and never returns it", async () => {
    const alice = await makeUser("alice");
    const { spaceId, link } = await connected(alice);
    const token = signingToken();

    const response = await saveToken(alice, spaceId, link.id, token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: link.id, status: "awaiting_delivery" });
    expect(response.body.signing_token_set_at).not.toBeNull();

    const listed = await read(alice, spaceId);

    for (const body of [JSON.stringify(response.body), JSON.stringify(listed.body)]) {
      expect(body).not.toContain(token);
      expect(body).not.toContain(token.slice("whsec_".length));
    }

    const sealed = (await row(link.id)).signing_token_sealed;

    expect(sealed).not.toContain(token.slice("whsec_".length));
    expect(openSecret(sealed!, KEY, `board_gitlab_projects:${link.id}`)).toBe(token);
  });

  it("trims a pasted token and replaces an earlier one", async () => {
    const alice = await makeUser("alice");
    const { spaceId, link } = await connected(alice);
    const first = signingToken();
    const second = signingToken();

    await saveToken(alice, spaceId, link.id, first);

    const response = await saveToken(alice, spaceId, link.id, `  ${second}\n`);

    expect(response.status).toBe(200);
    expect(openSecret((await row(link.id)).signing_token_sealed!, KEY, `board_gitlab_projects:${link.id}`)).toBe(second);
  });

  it.each([
    ["no whsec_ prefix", randomBytes(32).toString("base64"), "token: must start with whsec_ — copy the whole signing token from GitLab."],
    ["characters outside base64", "whsec_this-is*not#base64", "token: is not a GitLab signing token."],
    ["too short", `whsec_${randomBytes(8).toString("base64")}`, "token: is not a GitLab signing token."],
    ["empty", "", "token: must start with whsec_ — copy the whole signing token from GitLab."],
  ])("refuses a token with %s and echoes none of it", async (_label, token, message) => {
    const alice = await makeUser("alice");
    const { spaceId, link } = await connected(alice);

    const response = await saveToken(alice, spaceId, link.id, token);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(message);
    if (token !== "") expect(JSON.stringify(response.body)).not.toContain(token);
    expect((await row(link.id)).signing_token_sealed).toBeNull();
  });

  it("refuses to store a token when the server has no INTEGRATION_SECRET_KEY", async () => {
    const alice = await makeUser("alice");
    const { spaceId, link } = await connected(alice);
    const writable = env as { INTEGRATION_SECRET_KEY?: string };
    const configured = writable.INTEGRATION_SECRET_KEY;

    writable.INTEGRATION_SECRET_KEY = undefined;

    try {
      const response = await saveToken(alice, spaceId, link.id, signingToken());

      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe("GitLab integration is not configured on this server.");
      expect((await row(link.id)).signing_token_sealed).toBeNull();
    } finally {
      writable.INTEGRATION_SECRET_KEY = configured;
    }
  });

  it("refuses a disconnected link", async () => {
    const alice = await makeUser("alice");
    const { spaceId, link } = await connected(alice);

    await client.del(`${spacePath(spaceId)}/${link.id}`, undefined, { token: alice.token });

    expect((await saveToken(alice, spaceId, link.id, signingToken())).status).toBe(404);
    expect((await row(link.id)).signing_token_sealed).toBeNull();
  });
});

describe("disconnecting", () => {
  it("keeps the link and every development record it brought, and wipes the token", async () => {
    const alice = await makeUser("alice");
    const { spaceId, link } = await connected(alice);
    const status = await firstStatusOf(alice.boardId);
    const card = await client.post<{ id: string }>(
      `/api/v1/boards/${alice.boardId}/todos`,
      { title: "card", status_id: status.id },
      { token: alice.token },
    );

    await saveToken(alice, spaceId, link.id, signingToken());
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

    const response = await client.del(`${spacePath(spaceId)}/${link.id}`, undefined, { token: alice.token });

    expect(response.status).toBe(204);
    expect((await read(alice, spaceId)).body.link).toBeNull();
    expect(await row(link.id)).toMatchObject({ signing_token_sealed: null, signing_token_set_at: null });
    expect(await prisma.todo_gitlab_commits.count()).toBe(1);

    const again = await client.del(`${spacePath(spaceId)}/${link.id}`, undefined, { token: alice.token });

    expect(again.status).toBe(404);
  });
});

describe("who may manage a space's GitLab project", () => {
  async function scene() {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");
    const editor = await makeUser("editor");
    const viewer = await makeUser("viewer");
    const stranger = await makeUser("stranger");

    await addMember(owner.boardId, admin, "admin", owner.id);
    await addMember(owner.boardId, editor, "editor", owner.id);
    await addMember(owner.boardId, viewer, "viewer", owner.id);

    return { owner, admin, editor, viewer, stranger, ...(await connected(owner)) };
  }

  // In sequence, not in parallel: the save and the delete name the same link.
  async function attempts(user: TestUser, spaceId: string, linkId: string): Promise<number[]> {
    return [
      (await read(user, spaceId)).status,
      (await saveToken(user, spaceId, linkId, signingToken())).status,
      (await client.del(`${spacePath(spaceId)}/${linkId}`, undefined, { token: user.token })).status,
      (await connect(user, spaceId, "acme/another")).status,
    ];
  }

  it("allows the space's owner", async () => {
    const { owner, spaceId, link } = await scene();

    expect(await attempts(owner, spaceId, link.id)).toEqual([200, 200, 204, 201]);
  });

  // A space has no membership: a role on a board filed there is not a role on
  // the space, so even a board admin finds nothing, as for a space that does
  // not exist.
  it.each(["admin", "editor", "viewer", "stranger"] as const)("answers 404 to a board's %s", async (role) => {
    const users = await scene();

    expect(await attempts(users[role], users.spaceId, users.link.id)).toEqual([404, 404, 404, 404]);
    expect(await prisma.board_gitlab_projects.count({ where: { disconnected_at: null } })).toBe(1);
  });

  it("answers 404 for a link that belongs to another space", async () => {
    const { owner, stranger, link } = await scene();
    const strangerSpace = await spaceIdOf(stranger.boardId);

    const save = await saveToken(stranger, strangerSpace, link.id, signingToken());
    const remove = await client.del(`${spacePath(strangerSpace)}/${link.id}`, undefined, { token: stranger.token });

    expect([save.status, remove.status]).toEqual([404, 404]);
    expect(await row(link.id)).toMatchObject({ signing_token_sealed: null, disconnected_at: null });
    expect((await read(owner, await spaceIdOf(owner.boardId))).body.link?.id).toBe(link.id);
  });

  it("requires a session", async () => {
    const { spaceId, link } = await scene();
    const path = spacePath(spaceId);

    const responses = [
      await client.get(path),
      await client.post(path, { project_url: "acme/x" }),
      await client.put(`${path}/${link.id}/signing-token`, { token: signingToken() }),
      await client.del(`${path}/${link.id}`),
    ];

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
  });
});

describe("a board's GitLab settings", () => {
  it("show the space's project read-only, without its webhook url", async () => {
    const alice = await makeUser("alice");

    expect((await client.get(boardPath(alice.boardId), { token: alice.token })).body).toEqual({
      space_link: null,
      board_links: [],
    });

    await connected(alice);

    const response = await client.get<{ space_link: Record<string, unknown> }>(boardPath(alice.boardId), {
      token: alice.token,
    });

    expect(response.body.space_link).toEqual({
      project_path: "acme/backend",
      project_url: "https://gitlab.com/acme/backend",
      status: "awaiting_token",
      last_delivery_at: null,
    });
    expect(JSON.stringify(response.body)).not.toContain("webhook");
  });

  it("can no longer connect a project to one board", async () => {
    const alice = await makeUser("alice");

    const response = await client.post(boardPath(alice.boardId), { project_url: "acme/backend" }, { token: alice.token });

    expect(response.status).toBe(404);
    expect(await prisma.board_gitlab_projects.count()).toBe(0);
  });

  it("keep a board link from before 0035 repairable until it is disconnected", async () => {
    const alice = await makeUser("alice");
    const legacy = await boardLink(alice.boardId, alice.id);
    const token = signingToken();

    const listed = await client.get<{ board_links: Link[] }>(boardPath(alice.boardId), { token: alice.token });

    expect(listed.body.board_links.map((link) => link.id)).toEqual([legacy.id]);

    const saved = await client.put<Link>(
      `${boardPath(alice.boardId)}/${legacy.id}/signing-token`,
      { token },
      { token: alice.token },
    );

    expect(saved.status).toBe(200);
    expect(openSecret((await row(legacy.id)).signing_token_sealed!, KEY, `board_gitlab_projects:${legacy.id}`)).toBe(token);

    const removed = await client.del(`${boardPath(alice.boardId)}/${legacy.id}`, undefined, { token: alice.token });

    expect(removed.status).toBe(204);
    expect(await row(legacy.id)).toMatchObject({ signing_token_sealed: null, board_id: alice.boardId });
    expect((await row(legacy.id)).disconnected_at).not.toBeNull();
  });

  it("cannot reach the space's own link through a board route", async () => {
    const alice = await makeUser("alice");
    const { link } = await connected(alice);

    const save = await client.put(
      `${boardPath(alice.boardId)}/${link.id}/signing-token`,
      { token: signingToken() },
      { token: alice.token },
    );
    const remove = await client.del(`${boardPath(alice.boardId)}/${link.id}`, undefined, { token: alice.token });

    expect([save.status, remove.status]).toEqual([404, 404]);
    expect((await row(link.id)).disconnected_at).toBeNull();
  });

  it("are open to the board's admins and closed to editors, viewers and strangers", async () => {
    const owner = await makeUser("owner");
    const admin = await makeUser("admin");
    const editor = await makeUser("editor");
    const viewer = await makeUser("viewer");
    const stranger = await makeUser("stranger");

    await addMember(owner.boardId, admin, "admin", owner.id);
    await addMember(owner.boardId, editor, "editor", owner.id);
    await addMember(owner.boardId, viewer, "viewer", owner.id);

    async function attempts(user: TestUser): Promise<number[]> {
      const legacy = await boardLink(owner.boardId, owner.id, `acme/legacy-${user.username}`);

      await prisma.board_gitlab_projects.update({
        where: { id: legacy.id },
        data: { signing_token_sealed: sealSecret(signingToken(), KEY, `board_gitlab_projects:${legacy.id}`), signing_token_set_at: new Date() },
      });

      return [
        (await client.get(boardPath(owner.boardId), { token: user.token })).status,
        (
          await client.put(`${boardPath(owner.boardId)}/${legacy.id}/signing-token`, { token: signingToken() }, {
            token: user.token,
          })
        ).status,
        (await client.del(`${boardPath(owner.boardId)}/${legacy.id}`, undefined, { token: user.token })).status,
      ];
    }

    expect(await attempts(admin)).toEqual([200, 200, 204]);
    expect(await attempts(editor)).toEqual([403, 403, 403]);
    expect(await attempts(viewer)).toEqual([403, 403, 403]);
    expect(await attempts(stranger)).toEqual([404, 404, 404]);
  });
});

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { sealSecret } from "../../lib/secretBox.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, firstStatusOf, makeUser, type TestUser } from "../../testing/fixtures.js";
import {
  connectSpaceProject,
  deliver,
  mergeRequestPayload,
  pushPayload,
  signedDelivery,
  signingToken,
  spaceIdOf,
} from "../../testing/gitlab.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";
import { startRealtimeHarness, type RealtimeHarness } from "../../testing/realtimeHarness.js";

// What moving GitLab from the board to the space (0035, 0036) promises: one
// link serves every board filed in the space, now and later, and nothing a
// link recorded is lost when the space changes or drops its project.

let client: TestClient;
let harness: RealtimeHarness;

beforeAll(async () => {
  client = await startTestServer();
  harness = await startRealtimeHarness();
});

beforeEach(resetDatabase);

afterEach(() => harness.reset());

afterAll(async () => {
  await client.close();
  await harness.close();
  await disconnect();
});

const KEY = Buffer.from("test-integration-key-32-bytes!!!");
const BACKFILL = new URL("../../../prisma/migrations/0036_gitlab_space_links_backfill/migration.sql", import.meta.url);

interface Board {
  id: string;
  key_prefix: string;
}

interface Target {
  linkId: string;
  token: string;
}

async function boardIn(user: TestUser, spaceId: string | null, title: string): Promise<Board> {
  const response = await client.post<Board>("/api/v1/boards", { title, space_id: spaceId }, { token: user.token });

  if (response.status !== 201) throw new Error(`board failed: ${response.status}`);

  return response.body;
}

async function newSpace(user: TestUser, title: string): Promise<string> {
  const response = await client.post<{ id: string }>("/api/v1/spaces", { title }, { token: user.token });

  if (response.status !== 201) throw new Error(`space failed: ${response.status}`);

  return response.body.id;
}

// The board's first card, so its reference is <key>-1.
async function firstCard(user: TestUser, board: Board): Promise<{ id: string; ref: string }> {
  const status = await firstStatusOf(board.id);
  const response = await client.post<{ id: string; board_key: number }>(
    `/api/v1/boards/${board.id}/todos`,
    { title: "card", status_id: status.id },
    { token: user.token },
  );

  if (response.status !== 201) throw new Error(`card failed: ${response.status}`);

  return { id: response.body.id, ref: `${board.key_prefix}-${response.body.board_key}` };
}

function push(target: Target, message: string) {
  return deliver(client.url, target.linkId, signedDelivery(target.token, pushPayload({ commits: [{ message }] })));
}

function mergeRequest(target: Target, payload: Parameters<typeof mergeRequestPayload>[0]) {
  return deliver(
    client.url,
    target.linkId,
    signedDelivery(target.token, mergeRequestPayload(payload), { event: "Merge Request Hook" }),
  );
}

// A link as 0034 made them: owned by one board, already holding its token.
async function boardLink(boardId: string, createdBy: string | null, projectPath = "acme/backend"): Promise<Target> {
  const token = signingToken();
  const link = await prisma.board_gitlab_projects.create({
    data: { board_id: boardId, instance_url: "https://gitlab.com", project_path: projectPath, created_by: createdBy },
  });

  await prisma.board_gitlab_projects.update({
    where: { id: link.id },
    data: {
      signing_token_sealed: sealSecret(token, KEY, `board_gitlab_projects:${link.id}`),
      signing_token_set_at: new Date(),
    },
  });

  return { linkId: link.id, token };
}

function commitsOn(todoId: string) {
  return prisma.todo_gitlab_commits.findMany({ where: { todo_id: todoId }, select: { title: true, link_id: true } });
}

async function provisioned(user: TestUser): Promise<Board> {
  return prisma.boards.findUniqueOrThrow({ where: { id: user.boardId }, select: { id: true, key_prefix: true } });
}

describe("one link for the whole space", () => {
  it("writes to every board filed in the space, including one created after connecting", async () => {
    const alice = await makeUser("alice");
    const spaceId = await spaceIdOf(alice.boardId);
    const api = await boardIn(alice, spaceId, "API");
    const apiCard = await firstCard(alice, api);
    const target = await connectSpaceProject(client, alice, api.id);
    const web = await boardIn(alice, spaceId, "Web");
    const webCard = await firstCard(alice, web);

    const response = await push(target, `${apiCard.ref} and ${webCard.ref} in one commit`);

    expect(response.body).toMatchObject({ commits: 2 });
    expect(await commitsOn(apiCard.id)).toHaveLength(1);
    expect(await commitsOn(webCard.id)).toHaveLength(1);
    expect(await prisma.board_gitlab_projects.count()).toBe(1);
  });

  it("does not reach a board in another space, even one its owner has", async () => {
    const alice = await makeUser("alice");
    const target = await connectSpaceProject(client, alice, alice.boardId);
    const elsewhere = await boardIn(alice, await newSpace(alice, "Elsewhere"), "Other");
    const unfiled = await boardIn(alice, null, "Loose");
    const [otherCard, looseCard] = [await firstCard(alice, elsewhere), await firstCard(alice, unfiled)];

    const response = await push(target, `${otherCard.ref} and ${looseCard.ref}`);

    expect(response.body).toMatchObject({ commits: 0 });
    expect(await prisma.todo_gitlab_commits.count()).toBe(0);
  });

  it("follows a board moved between spaces, and leaves what it recorded behind", async () => {
    const alice = await makeUser("alice");
    const target = await connectSpaceProject(client, alice, alice.boardId);
    const connectedSpace = await spaceIdOf(alice.boardId);
    const otherSpace = await newSpace(alice, "Elsewhere");
    const mobile = await boardIn(alice, otherSpace, "Mobile");
    const card = await firstCard(alice, mobile);
    const move = (spaceId: string) =>
      client.patch(`/api/v1/boards/${mobile.id}`, { space_id: spaceId }, { token: alice.token });

    expect((await push(target, `${card.ref} before the move`)).body).toMatchObject({ commits: 0 });

    await move(connectedSpace);
    expect((await push(target, `${card.ref} after the move`)).body).toMatchObject({ commits: 1 });

    await move(otherSpace);
    expect((await push(target, `${card.ref} after moving back`)).body).toMatchObject({ commits: 0 });

    expect((await commitsOn(card.id)).map((commit) => commit.title)).toEqual([`${card.ref} after the move`]);
  });

  it("tells every board in the space when the project changes", async () => {
    const alice = await makeUser("alice");
    const second = await boardIn(alice, await spaceIdOf(alice.boardId), "Second");
    const watchers = [await harness.connect(alice.token), await harness.connect(alice.token)];

    await watchers[0]!.join(alice.boardId);
    await watchers[1]!.join(second.id);

    const events = watchers.map((watcher) => watcher.waitFor<{ boardId: string; scopes: string[] }>("board:invalidate"));

    await connectSpaceProject(client, alice, alice.boardId, { token: null });

    expect(await Promise.all(events)).toEqual([
      { boardId: alice.boardId, scopes: ["development"] },
      { boardId: second.id, scopes: ["development"] },
    ]);
  });
});

describe("changing the project", () => {
  it("keeps the old project's history on the task and refuses the old webhook", async () => {
    const alice = await makeUser("alice");
    const card = await firstCard(alice, await provisioned(alice));
    const backend = await connectSpaceProject(client, alice, alice.boardId);

    await push(backend, `${card.ref} on the backend`);

    const frontend = await connectSpaceProject(client, alice, alice.boardId, { projectUrl: "acme/frontend" });

    expect((await push(backend, `${card.ref} too late`)).status).toBe(401);

    const development = await client.get<{ connected: boolean; projects: unknown[]; commits: { title: string; project_path: string }[] }>(
      `/api/v1/todos/${card.id}/development`,
      { token: alice.token },
    );

    expect(development.body.projects).toEqual([
      { project_path: "acme/frontend", project_url: "https://gitlab.com/acme/frontend" },
    ]);
    expect(development.body.commits).toMatchObject([{ title: `${card.ref} on the backend`, project_path: "acme/backend" }]);
    expect(frontend.linkId).not.toBe(backend.linkId);
  });

  it("picks the history back up when the space reconnects the same project", async () => {
    const alice = await makeUser("alice");
    const card = await firstCard(alice, await provisioned(alice));
    const first = await connectSpaceProject(client, alice, alice.boardId);
    const title = `${card.ref} Fix authentication`;

    await mergeRequest(first, { iid: 5, title, updatedAt: "2026-10-05T10:00:00Z" });
    await client.del(`/api/v1/spaces/${await spaceIdOf(alice.boardId)}/integrations/gitlab/${first.linkId}`, undefined, {
      token: alice.token,
    });

    const second = await connectSpaceProject(client, alice, alice.boardId);

    await mergeRequest(second, { iid: 5, title, state: "merged", action: "merge", updatedAt: "2026-10-05T11:00:00Z" });

    expect(
      await prisma.todo_gitlab_merge_requests.findMany({ select: { iid: true, state: true, link_id: true } }),
    ).toEqual([{ iid: 5, state: "merged", link_id: second.linkId }]);
  });
});

describe("board links from before 0035", () => {
  it("keep working for their own board only while the space has no link", async () => {
    const alice = await makeUser("alice");
    const api = await boardIn(alice, await spaceIdOf(alice.boardId), "API");
    const [apiCard, homeCard] = [await firstCard(alice, api), await firstCard(alice, await provisioned(alice))];
    const legacy = await boardLink(api.id, alice.id);

    expect((await push(legacy, `${apiCard.ref} and ${homeCard.ref}`)).body).toMatchObject({ commits: 1 });
    expect(await commitsOn(apiCard.id)).toHaveLength(1);
    expect(await commitsOn(homeCard.id)).toHaveLength(0);
  });

  it("are listed for the space's owner, and replaced, history and all, when the space connects their project", async () => {
    const alice = await makeUser("alice");
    const spaceId = await spaceIdOf(alice.boardId);
    const api = await boardIn(alice, spaceId, "API");
    const card = await firstCard(alice, api);
    const legacy = await boardLink(api.id, alice.id);

    await push(legacy, `${card.ref} through the board link`);

    const before = await client.get<{ board_links: { id: string; project_path: string; board: { id: string } }[] }>(
      `/api/v1/spaces/${spaceId}/integrations/gitlab`,
      { token: alice.token },
    );

    expect(before.body.board_links).toMatchObject([{ id: legacy.linkId, project_path: "acme/backend", board: { id: api.id } }]);

    const target = await connectSpaceProject(client, alice, alice.boardId);

    expect((await push(legacy, `${card.ref} after the space connected`)).status).toBe(401);
    expect((await push(target, `${card.ref} through the space`)).body).toMatchObject({ commits: 1 });
    expect((await commitsOn(card.id)).map((commit) => [commit.title, commit.link_id]).sort()).toEqual([
      [`${card.ref} through the board link`, target.linkId],
      [`${card.ref} through the space`, target.linkId],
    ]);
    expect(
      await prisma.board_gitlab_projects.findUniqueOrThrow({
        where: { id: legacy.linkId },
        select: { board_id: true, signing_token_sealed: true },
      }),
    ).toEqual({ board_id: api.id, signing_token_sealed: null });
  });

  it("fall silent on a board filed into a space that already has a link", async () => {
    const alice = await makeUser("alice");
    const loose = await boardIn(alice, null, "Loose");
    const card = await firstCard(alice, loose);
    const legacy = await boardLink(loose.id, alice.id);
    const target = await connectSpaceProject(client, alice, alice.boardId);

    await client.patch(`/api/v1/boards/${loose.id}`, { space_id: await spaceIdOf(alice.boardId) }, { token: alice.token });

    expect((await push(legacy, `${card.ref} from the board link`)).body).toMatchObject({ commits: 0 });
    expect((await push(target, `${card.ref} from the space`)).body).toMatchObject({ commits: 1 });
  });
});

describe("the 0036 backfill", () => {
  it("hands a space its only board link when the owner made it, and leaves every other case alone", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const carol = await makeUser("carol");
    const dave = await makeUser("dave");
    const erin = await makeUser("erin");

    const promoted = await boardLink(alice.boardId, alice.id);
    const bobSecond = await boardIn(bob, await spaceIdOf(bob.boardId), "Second");
    const twoInOneSpace = [await boardLink(bob.boardId, bob.id, "acme/a"), await boardLink(bobSecond.id, bob.id, "acme/b")];

    await addMember(carol.boardId, dave, "admin", carol.id);

    const madeByAnAdmin = await boardLink(carol.boardId, dave.id);
    const unfiled = await boardLink((await boardIn(erin, null, "Loose")).id, erin.id);
    const sql = readFileSync(BACKFILL, "utf8");

    expect(await prisma.$executeRawUnsafe(sql)).toBe(1);
    expect(await prisma.$executeRawUnsafe(sql)).toBe(0);

    const owners = async (target: Target) =>
      prisma.board_gitlab_projects.findUniqueOrThrow({
        where: { id: target.linkId },
        select: { space_id: true, board_id: true, signing_token_sealed: true },
      });

    expect(await owners(promoted)).toMatchObject({ space_id: await spaceIdOf(alice.boardId), board_id: null });
    expect((await owners(promoted)).signing_token_sealed).not.toBeNull();

    for (const untouched of [...twoInOneSpace, madeByAnAdmin, unfiled]) {
      expect((await owners(untouched)).space_id).toBeNull();
    }

    const aliceCard = await firstCard(alice, await provisioned(alice));

    expect((await push(promoted, `${aliceCard.ref} through the promoted link`)).body).toMatchObject({ commits: 1 });
  });
});

describe("deleting a space", () => {
  it("unfiles its boards with their history and leaves the link accepting nothing", async () => {
    const alice = await makeUser("alice");
    const card = await firstCard(alice, await provisioned(alice));
    const spaceId = await spaceIdOf(alice.boardId);
    const target = await connectSpaceProject(client, alice, alice.boardId);

    await push(target, `${card.ref} before the space went`);

    expect((await client.del(`/api/v1/spaces/${spaceId}`, undefined, { token: alice.token })).status).toBe(204);
    expect((await push(target, `${card.ref} after the space went`)).status).toBe(401);

    const development = await client.get<{ connected: boolean; commits: { title: string }[] }>(
      `/api/v1/todos/${card.id}/development`,
      { token: alice.token },
    );

    expect(development.body.connected).toBe(false);
    expect(development.body.commits.map((commit) => commit.title)).toEqual([`${card.ref} before the space went`]);
  });
});

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, firstStatusOf, makeUser, type TestUser } from "../../testing/fixtures.js";
import {
  ZERO_SHA,
  deliver,
  mergeRequestPayload,
  pushPayload,
  sha,
  signedDelivery,
  signingToken,
} from "../../testing/gitlab.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";
import { startRealtimeHarness, settle, type RealtimeHarness } from "../../testing/realtimeHarness.js";

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

interface Card {
  id: string;
  board_key: number;
}

async function board(user: TestUser, title: string): Promise<{ id: string; key_prefix: string }> {
  const response = await client.post<{ id: string; key_prefix: string }>("/api/v1/boards", { title }, { token: user.token });

  if (response.status !== 201) throw new Error(`board failed: ${response.status}`);

  return response.body;
}

async function cards(user: TestUser, boardId: string, count: number): Promise<Card[]> {
  const status = await firstStatusOf(boardId);
  const created: Card[] = [];

  for (let i = 0; i < count; i += 1) {
    const response = await client.post<Card>(
      `/api/v1/boards/${boardId}/todos`,
      { title: `card ${i + 1}`, status_id: status.id },
      { token: user.token },
    );

    if (response.status !== 201) throw new Error(`card failed: ${response.status}`);

    created.push(response.body);
  }

  return created;
}

async function linked(user: TestUser, boardId: string, projectUrl = "https://gitlab.com/acme/backend", token = signingToken()) {
  const connected = await client.post<{ link: { id: string } }>(
    `/api/v1/boards/${boardId}/integrations/gitlab`,
    { project_url: projectUrl },
    { token: user.token },
  );
  const saved = await client.put(
    `/api/v1/boards/${boardId}/integrations/gitlab/${connected.body.link.id}/signing-token`,
    { token },
    { token: user.token },
  );

  if (connected.status !== 201 || saved.status !== 200) throw new Error("link failed");

  return { linkId: connected.body.link.id, token };
}

const now = () => Math.floor(Date.now() / 1000);

function pushTo(target: { linkId: string; token: string }, payload: unknown, timestamp = now()) {
  return deliver(client.url, target.linkId, signedDelivery(target.token, payload, { timestamp }));
}

function mergeRequestTo(target: { linkId: string; token: string }, payload: unknown) {
  return deliver(client.url, target.linkId, signedDelivery(target.token, payload, { event: "Merge Request Hook" }));
}

async function apiBoard(cardCount = 2) {
  const alice = await makeUser("alice");
  const api = await board(alice, "API");
  const created = await cards(alice, api.id, cardCount);
  const target = await linked(alice, api.id);

  return { alice, api, cards: created, target };
}

function commitsOf(todoId: string) {
  return prisma.todo_gitlab_commits.findMany({ where: { todo_id: todoId }, orderBy: { committed_at: "asc" } });
}

describe("commits", () => {
  it("attaches a commit to the task it names, with what GitLab reported", async () => {
    const { api, cards: [first], target } = await apiBoard();

    const response = await pushTo(target, pushPayload({ commits: [{ message: "API-1 Fix authentication" }] }));

    expect(response).toEqual({
      status: 200,
      body: { status: "processed", event: "push", commits: 1, branches: 0 },
    });
    expect(await commitsOf(first!.id)).toEqual([
      expect.objectContaining({
        board_id: api.id,
        link_id: target.linkId,
        sha: sha("API-1 Fix authentication"),
        title: "API-1 Fix authentication",
        message: "API-1 Fix authentication",
        author_name: "Ada Lovelace",
        committed_at: new Date("2026-10-05T18:26:21Z"),
        matched_ref: "API-1",
      }),
    ]);
  });

  it("reads a lowercase reference and keeps it as written", async () => {
    const { cards: [first], target } = await apiBoard();

    await pushTo(target, pushPayload({ commits: [{ message: "api-1 fix" }] }));

    expect((await commitsOf(first!.id)).map((row) => row.matched_ref)).toEqual(["api-1"]);
  });

  it("attaches one commit to every task it names", async () => {
    const { cards: [first, second], target } = await apiBoard();

    const response = await pushTo(target, pushPayload({ commits: [{ message: "API-1 and API-2 share a fix" }] }));

    expect(response.body).toMatchObject({ commits: 2 });
    expect(await commitsOf(first!.id)).toHaveLength(1);
    expect(await commitsOf(second!.id)).toHaveLength(1);
  });

  it("handles every commit in a push, skipping the ones that name nothing", async () => {
    const { cards: [first, second], target } = await apiBoard();

    const response = await pushTo(
      target,
      pushPayload({ commits: [{ message: "Initial commit" }, { message: "API-1 one" }, { message: "API-2 two" }] }),
    );

    expect(response.body).toMatchObject({ commits: 2 });
    expect((await commitsOf(first!.id)).map((row) => row.title)).toEqual(["API-1 one"]);
    expect((await commitsOf(second!.id)).map((row) => row.title)).toEqual(["API-2 two"]);
  });

  it("stores nothing twice when GitLab delivers the same commits again", async () => {
    const { cards: [first], target } = await apiBoard();
    const payload = pushPayload({ commits: [{ message: "API-1 Fix" }] });

    const firstTime = await pushTo(target, payload);
    const again = await pushTo(target, payload);
    const testButton = await pushTo(
      target,
      pushPayload({ commits: [{ message: "Initial commit" }, { message: "API-1 Fix" }] }),
    );

    expect([firstTime.body, again.body, testButton.body]).toMatchObject([{ commits: 1 }, { commits: 0 }, { commits: 0 }]);
    expect(await commitsOf(first!.id)).toHaveLength(1);
  });

  it.each([
    ["a number the board never reached", "API-99 fix"],
    ["a key no board has", "ZZZ-1 fix"],
    ["no reference", "Initial commit"],
    ["a malformed reference", "API-01 and API- and -1"],
  ])("attaches nothing for %s", async (_label, message) => {
    const { target } = await apiBoard();

    const response = await pushTo(target, pushPayload({ commits: [{ message }] }));

    expect(response.body).toMatchObject({ status: "processed", commits: 0 });
    expect(await prisma.todo_gitlab_commits.count()).toBe(0);
  });

  it("resolves a key the board used to have", async () => {
    const { alice, api, cards: [first], target } = await apiBoard();

    await client.patch(`/api/v1/boards/${api.id}`, { key_prefix: "APX" }, { token: alice.token });

    await pushTo(target, pushPayload({ commits: [{ message: "API-1 under the old key" }] }));
    await pushTo(
      target,
      pushPayload({
        commits: [{ message: "APX-1 under the new key, API-1 too", timestamp: "2026-10-05T18:30:00+00:00" }],
      }),
    );

    expect((await commitsOf(first!.id)).map((row) => row.matched_ref)).toEqual(["API-1", "APX-1"]);
  });

  it("attaches nothing to a deleted task", async () => {
    const { alice, cards: [first], target } = await apiBoard();

    await client.del(`/api/v1/todos/${first!.id}`, undefined, { token: alice.token });

    const response = await pushTo(target, pushPayload({ commits: [{ message: "API-1 too late" }] }));

    expect(response.body).toMatchObject({ commits: 0 });
    expect(await prisma.todo_gitlab_commits.count()).toBe(0);
  });
});

describe("boards linked to the same GitLab project", () => {
  async function twoBoards() {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const api = await board(alice, "API");
    const mobile = await board(bob, "Mobile");
    const [apiCard] = await cards(alice, api.id, 1);
    const [mobileCard] = await cards(bob, mobile.id, 1);

    return {
      alice,
      bob,
      api,
      mobile,
      apiCard: apiCard!,
      mobileCard: mobileCard!,
      apiLink: await linked(alice, api.id),
      mobileLink: await linked(bob, mobile.id),
    };
  }

  it("each receive only their own board's tasks from the same commit", async () => {
    const { mobile, apiCard, mobileCard, apiLink, mobileLink } = await twoBoards();
    const payload = pushPayload({ commits: [{ message: "API-1 and MOB-1 in one commit" }] });

    expect((await pushTo(apiLink, payload)).body).toMatchObject({ commits: 1 });
    expect(await prisma.todo_gitlab_commits.findMany({ select: { todo_id: true } })).toEqual([
      { todo_id: apiCard.id },
    ]);

    expect((await pushTo(mobileLink, payload)).body).toMatchObject({ commits: 1 });
    expect(await prisma.todo_gitlab_commits.count({ where: { board_id: mobile.id } })).toBe(1);
    expect(await commitsOf(mobileCard.id)).toHaveLength(1);
  });

  it("never write another board's tasks, even for someone on both boards", async () => {
    const { alice, bob, mobile, apiLink } = await twoBoards();

    await addMember(mobile.id, alice, "admin", bob.id);

    const response = await pushTo(apiLink, pushPayload({ commits: [{ message: "MOB-1 from the API link" }] }));

    expect(response.body).toMatchObject({ commits: 0 });
    expect(await prisma.todo_gitlab_commits.count()).toBe(0);
  });
});

describe("branches", () => {
  function branchPush(target: { linkId: string; token: string }, after: string, timestamp: number) {
    return pushTo(target, pushPayload({ ref: "refs/heads/feature/API-1-auth", before: sha("base"), after }), timestamp);
  }

  function branchRow() {
    return prisma.todo_gitlab_branches.findFirstOrThrow({ where: { name: "feature/API-1-auth" } });
  }

  it("follows a branch named after a task through pushes, deletion and late deliveries", async () => {
    const { cards: [first], target } = await apiBoard();
    const start = now();

    const created = await pushTo(
      target,
      pushPayload({ ref: "refs/heads/feature/API-1-auth", before: ZERO_SHA, after: sha("a") }),
      start - 200,
    );

    expect(created.body).toMatchObject({ branches: 1 });
    expect(await branchRow()).toMatchObject({ todo_id: first!.id, head_sha: sha("a"), deleted_at: null });

    await branchPush(target, sha("b"), start - 150);
    expect((await branchRow()).head_sha).toBe(sha("b"));

    await branchPush(target, ZERO_SHA, start - 100);
    expect((await branchRow()).deleted_at).not.toBeNull();

    const late = await branchPush(target, sha("c"), start - 130);
    expect(late.body).toMatchObject({ branches: 0 });
    expect((await branchRow()).deleted_at).not.toBeNull();

    await branchPush(target, sha("d"), start - 50);
    expect(await branchRow()).toMatchObject({ head_sha: sha("d"), deleted_at: null });
  });
});

describe("merge requests", () => {
  const t = (minute: number) => `2026-10-05T18:${String(minute).padStart(2, "0")}:00.000Z`;

  it("tracks a merge request's state and ignores an update older than the stored one", async () => {
    const { cards: [first, second], target } = await apiBoard();
    const mergeRequest = (overrides: Partial<Parameters<typeof mergeRequestPayload>[0]>) =>
      mergeRequestPayload({ iid: 42, title: "API-1 Fix authentication", ...overrides });

    expect((await mergeRequestTo(target, mergeRequest({ updatedAt: t(10) }))).body).toMatchObject({
      status: "processed",
      event: "merge_request",
      merge_requests: 1,
    });

    await mergeRequestTo(target, mergeRequest({ state: "merged", action: "merge", updatedAt: t(30) }));
    await mergeRequestTo(target, mergeRequest({ state: "opened", action: "update", updatedAt: t(20) }));

    expect(await prisma.todo_gitlab_merge_requests.findFirstOrThrow({ where: { todo_id: first!.id } })).toMatchObject({
      iid: 42,
      state: "merged",
      gitlab_updated_at: new Date(t(30)),
    });

    await mergeRequestTo(
      target,
      mergeRequest({ state: "merged", title: "API-1 Fix authentication (final)", description: "Also API-2.", updatedAt: t(40) }),
    );

    const rows = await prisma.todo_gitlab_merge_requests.findMany({ orderBy: { created_at: "asc" } });

    expect(rows.map((row) => [row.todo_id, row.title, row.state])).toEqual([
      [first!.id, "API-1 Fix authentication (final)", "merged"],
      [second!.id, "API-1 Fix authentication (final)", "merged"],
    ]);
  });

  it("finds the task from the source branch alone", async () => {
    const { cards: [first], target } = await apiBoard();

    await mergeRequestTo(target, mergeRequestPayload({ title: "Fix login", sourceBranch: "feature/API-1-login" }));

    expect(await prisma.todo_gitlab_merge_requests.count({ where: { todo_id: first!.id } })).toBe(1);
  });
});

describe("realtime", () => {
  it("tells the board's open clients, and only that board's, that development changed", async () => {
    const { alice, api, target } = await apiBoard();
    const bob = await makeUser("bob");
    const watcher = await harness.connect(alice.token);
    const other = await harness.connect(bob.token);

    await watcher.join(api.id);
    await other.join(bob.boardId);

    const event = watcher.waitFor<{ boardId: string; scopes: string[] }>("board:invalidate");

    await pushTo(target, pushPayload({ commits: [{ message: "API-1 live" }] }));

    expect(await event).toEqual({ boardId: api.id, scopes: ["development"] });

    await settle();
    expect(other.seen("board:invalidate")).toHaveLength(0);
  });

  it("stays quiet when a delivery changes nothing", async () => {
    const { alice, api, target } = await apiBoard();
    const watcher = await harness.connect(alice.token);

    await watcher.join(api.id);
    await pushTo(target, pushPayload({ commits: [{ message: "Initial commit" }] }));
    await settle();

    expect(watcher.seen("board:invalidate")).toHaveLength(0);
  });
});

// The four real GitLab.com deliveries captured in Phase 3A, replayed byte for
// byte with the clock set to when GitLab sent each one. Local-only: they and
// the token that signed them are gitignored.
const LOCAL_FIXTURE = new URL("../../../gitlab-fixture.local/", import.meta.url);
const TOKEN_FILE = new URL("signing-token.txt", LOCAL_FIXTURE);

describe.skipIf(!existsSync(TOKEN_FILE))("the real GitLab.com deliveries (local fixture)", () => {
  function realDeliveries() {
    return readdirSync(LOCAL_FIXTURE)
      .filter((name) => /^delivery-\d+\.json$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
      .map((name) => {
        const { headers } = JSON.parse(readFileSync(new URL(name, LOCAL_FIXTURE), "utf8")) as {
          headers: Record<string, string>;
        };
        const keep = ["content-type", "webhook-id", "webhook-timestamp", "webhook-signature", "x-gitlab-event", "x-gitlab-instance"];

        return {
          headers: Object.fromEntries(keep.filter((key) => headers[key] !== undefined).map((key) => [key, headers[key]!])),
          body: readFileSync(new URL(name.replace(/\.json$/, ".body"), LOCAL_FIXTURE)),
        };
      });
  }

  it("processes them end to end, once", async () => {
    const alice = await makeUser("alice");
    const api = await board(alice, "API");
    const created = await cards(alice, api.id, 23);
    const api23 = created[22]!;
    const { linkId } = await linked(
      alice,
      api.id,
      "https://gitlab.com/friidom/veylo-webhook-test",
      readFileSync(TOKEN_FILE, "utf8").trim(),
    );

    const outcomes: unknown[] = [];

    try {
      for (const delivery of realDeliveries()) {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Number(delivery.headers["webhook-timestamp"]) * 1000);

        outcomes.push((await deliver(client.url, linkId, delivery)).body);

        vi.useRealTimers();
      }
    } finally {
      vi.useRealTimers();
    }

    expect(outcomes).toEqual([
      { status: "processed", event: "push", commits: 1, branches: 0 },
      { status: "processed", event: "push", commits: 1, branches: 1 },
      { status: "processed", event: "merge_request", merge_requests: 1 },
      { status: "processed", event: "push", commits: 0, branches: 0 },
    ]);

    expect((await commitsOf(api23.id)).map((row) => [row.sha.slice(0, 8), row.matched_ref])).toEqual([
      ["74be48fb", "API-23"],
      ["72a40045", "api-23"],
    ]);
    expect(await prisma.todo_gitlab_branches.findMany({ select: { name: true, todo_id: true } })).toEqual([
      { name: "feature/API-23-webhook", todo_id: api23.id },
    ]);
    expect(await prisma.todo_gitlab_merge_requests.findMany({ select: { iid: true, state: true, todo_id: true } })).toEqual([
      { iid: 1, state: "opened", todo_id: api23.id },
    ]);

    const replayedNow = await deliver(client.url, linkId, realDeliveries()[0]!);

    expect(replayedNow).toEqual({ status: 401, body: { error: { code: "unauthorized", message: "Webhook delivery refused." } } });
  });
});

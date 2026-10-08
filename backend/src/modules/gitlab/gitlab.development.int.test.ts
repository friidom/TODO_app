import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { disconnect, resetDatabase } from "../../testing/db.js";
import { addMember, firstStatusOf, makeUser, type TestUser } from "../../testing/fixtures.js";
import {
  PROJECT,
  ZERO_SHA,
  deliver,
  mergeRequestPayload,
  pushPayload,
  sha,
  signedDelivery,
  signingToken,
} from "../../testing/gitlab.js";
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

interface Development {
  connected: boolean;
  projects: { project_path: string; project_url: string }[];
  commits: { sha: string; title: string; author_name: string; committed_at: string; url: string; project_path: string }[];
  branches: { name: string; head_sha: string; url: string; project_path: string; updated_at: string }[];
  merge_requests: {
    iid: number;
    title: string;
    state: string;
    source_branch: string;
    target_branch: string;
    url: string;
    project_path: string;
    updated_at: string;
  }[];
}

async function scene() {
  const alice = await makeUser("alice");
  const created = await client.post<{ id: string }>("/api/v1/boards", { title: "API" }, { token: alice.token });
  const boardId = created.body.id;
  const status = await firstStatusOf(boardId);
  const card = await client.post<{ id: string }>(
    `/api/v1/boards/${boardId}/todos`,
    { title: "card", status_id: status.id },
    { token: alice.token },
  );

  return { alice, boardId, todoId: card.body.id };
}

async function link(user: TestUser, boardId: string) {
  const token = signingToken();
  const connected = await client.post<{ link: { id: string } }>(
    `/api/v1/boards/${boardId}/integrations/gitlab`,
    { project_url: "https://gitlab.com/acme/backend" },
    { token: user.token },
  );

  await client.put(
    `/api/v1/boards/${boardId}/integrations/gitlab/${connected.body.link.id}/signing-token`,
    { token },
    { token: user.token },
  );

  return { linkId: connected.body.link.id, token };
}

function developmentOf(user: TestUser, todoId: string, query = "") {
  return client.get<Development>(`/api/v1/todos/${todoId}/development${query}`, { token: user.token });
}

describe("GET /todos/:todoId/development", () => {
  it("returns the task's commits, branches and merge requests, newest first, with GitLab links", async () => {
    const { alice, boardId, todoId } = await scene();
    const { linkId, token } = await link(alice, boardId);
    const send = (payload: unknown, event = "Push Hook") =>
      deliver(client.url, linkId, signedDelivery(token, payload, { event }));

    await send(
      pushPayload({
        commits: [
          { message: "API-1 add auth middleware", timestamp: "2026-10-05T10:00:00+00:00", author: "Ali" },
          { message: "API-1 fix authentication flow", timestamp: "2026-10-05T12:00:00+00:00" },
        ],
      }),
    );
    await send(pushPayload({ ref: "refs/heads/feature/API-1-auth", before: ZERO_SHA, after: sha("tip") }));
    await send(
      mergeRequestPayload({ iid: 42, title: "API-1 Fix authentication", sourceBranch: "feature/API-1-auth" }),
      "Merge Request Hook",
    );

    const response = await developmentOf(alice, todoId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      connected: true,
      projects: [{ project_path: "acme/backend", project_url: PROJECT.web_url }],
      commits: [
        {
          sha: sha("API-1 fix authentication flow"),
          title: "API-1 fix authentication flow",
          message: "API-1 fix authentication flow",
          author_name: "Ada Lovelace",
          committed_at: "2026-10-05T12:00:00.000Z",
          url: `${PROJECT.web_url}/-/commit/${sha("API-1 fix authentication flow")}`,
          project_path: "acme/backend",
        },
        {
          sha: sha("API-1 add auth middleware"),
          title: "API-1 add auth middleware",
          message: "API-1 add auth middleware",
          author_name: "Ali",
          committed_at: "2026-10-05T10:00:00.000Z",
          url: `${PROJECT.web_url}/-/commit/${sha("API-1 add auth middleware")}`,
          project_path: "acme/backend",
        },
      ],
      branches: [
        {
          name: "feature/API-1-auth",
          head_sha: sha("tip"),
          url: `${PROJECT.web_url}/-/tree/feature/API-1-auth`,
          project_path: "acme/backend",
          updated_at: expect.any(String),
        },
      ],
      merge_requests: [
        {
          iid: 42,
          title: "API-1 Fix authentication",
          state: "opened",
          source_branch: "feature/API-1-auth",
          target_branch: "main",
          url: `${PROJECT.web_url}/-/merge_requests/42`,
          project_path: "acme/backend",
          updated_at: "2026-10-05T18:27:44.310Z",
        },
      ],
    });
  });

  it("exposes no internal identifiers", async () => {
    const { alice, boardId, todoId } = await scene();
    const { linkId, token } = await link(alice, boardId);

    await deliver(client.url, linkId, signedDelivery(token, pushPayload({ commits: [{ message: "API-1 x" }] })));

    const body = JSON.stringify((await developmentOf(alice, todoId)).body);

    for (const internal of [linkId, boardId, todoId, "link_id", "board_id", "todo_id", "sealed", "matched_ref"]) {
      expect(body).not.toContain(internal);
    }
  });

  it("leaves a deleted branch out", async () => {
    const { alice, boardId, todoId } = await scene();
    const { linkId, token } = await link(alice, boardId);
    const now = Math.floor(Date.now() / 1000);
    const branch = (after: string, timestamp: number) =>
      deliver(
        client.url,
        linkId,
        signedDelivery(token, pushPayload({ ref: "refs/heads/feature/API-1", before: sha("base"), after }), {
          timestamp,
        }),
      );

    await branch(sha("tip"), now - 10);
    await branch(ZERO_SHA, now);

    expect((await developmentOf(alice, todoId)).body.branches).toEqual([]);
  });

  it("says whether the board has GitLab connected at all", async () => {
    const { alice, boardId, todoId } = await scene();

    expect((await developmentOf(alice, todoId)).body).toEqual({
      connected: false,
      projects: [],
      commits: [],
      branches: [],
      merge_requests: [],
    });

    const { linkId } = await link(alice, boardId);

    expect((await developmentOf(alice, todoId)).body).toMatchObject({
      connected: true,
      projects: [{ project_path: "acme/backend", project_url: "https://gitlab.com/acme/backend" }],
    });

    await client.del(`/api/v1/boards/${boardId}/integrations/gitlab/${linkId}`, undefined, { token: alice.token });

    expect((await developmentOf(alice, todoId)).body).toMatchObject({ connected: false, projects: [] });
  });

  it("returns only the newest commits when asked for fewer", async () => {
    const { alice, boardId, todoId } = await scene();
    const { linkId, token } = await link(alice, boardId);

    await deliver(
      client.url,
      linkId,
      signedDelivery(
        token,
        pushPayload({
          commits: [
            { message: "API-1 first", timestamp: "2026-10-05T10:00:00+00:00" },
            { message: "API-1 second", timestamp: "2026-10-05T11:00:00+00:00" },
            { message: "API-1 third", timestamp: "2026-10-05T12:00:00+00:00" },
          ],
        }),
      ),
    );

    expect((await developmentOf(alice, todoId, "?limit=2")).body.commits.map((commit) => commit.title)).toEqual([
      "API-1 third",
      "API-1 second",
    ]);
    expect((await developmentOf(alice, todoId)).body.commits).toHaveLength(3);
    expect((await developmentOf(alice, todoId, "?limit=0")).status).toBe(400);
  });

  it("follows the project's address after a rename in GitLab", async () => {
    const { alice, boardId, todoId } = await scene();
    const { linkId, token } = await link(alice, boardId);

    await deliver(client.url, linkId, signedDelivery(token, pushPayload({ commits: [{ message: "API-1 before" }] })));

    const renamed = { ...PROJECT, path_with_namespace: "acme/core", web_url: "https://gitlab.com/acme/core" };

    await deliver(client.url, linkId, signedDelivery(token, pushPayload({ project: renamed, commits: [] })));

    const { commits, projects } = (await developmentOf(alice, todoId)).body;

    expect(commits[0]).toMatchObject({
      project_path: "acme/core",
      url: `https://gitlab.com/acme/core/-/commit/${sha("API-1 before")}`,
    });
    expect(projects).toEqual([{ project_path: "acme/core", project_url: "https://gitlab.com/acme/core" }]);
  });

  describe("who may read it", () => {
    it("lets any member read, whatever their role", async () => {
      const { alice, boardId, todoId } = await scene();
      const viewer = await makeUser("viewer");

      await addMember(boardId, viewer, "viewer", alice.id);

      expect((await developmentOf(viewer, todoId)).status).toBe(200);
    });

    it("answers 404 to someone not on the board, as for a task that does not exist", async () => {
      const { todoId } = await scene();
      const stranger = await makeUser("stranger");

      const real = await developmentOf(stranger, todoId);
      const missing = await developmentOf(stranger, randomUUID());

      expect(real.status).toBe(404);
      expect(real.body).toEqual(missing.body);
    });

    it("answers 404 to a malformed task id and 401 without a session", async () => {
      const { alice, todoId } = await scene();

      expect((await developmentOf(alice, "not-a-uuid")).status).toBe(404);
      expect((await client.get(`/api/v1/todos/${todoId}/development`)).status).toBe(401);
    });
  });
});

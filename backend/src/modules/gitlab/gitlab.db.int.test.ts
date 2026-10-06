import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { firstStatusOf, makeUser, type TestUser } from "../../testing/fixtures.js";
import { startTestServer, type TestClient } from "../../testing/httpClient.js";

// The guarantees 0034 makes on its own, below the service: whatever the code
// above it does, these hold.

let client: TestClient;

beforeAll(async () => {
  client = await startTestServer();
});

beforeEach(resetDatabase);

afterAll(async () => {
  await client.close();
  await disconnect();
});

const SHA = "74be48fbe4265f21e00b8aa93bb46614d720c4de";

async function createCard(user: TestUser, boardId: string): Promise<string> {
  const status = await firstStatusOf(boardId);
  const response = await client.post<{ id: string }>(
    `/api/v1/boards/${boardId}/todos`,
    { title: "card", status_id: status.id },
    { token: user.token },
  );

  if (response.status !== 201) throw new Error(`card failed: ${response.status}`);

  return response.body.id;
}

function link(boardId: string, projectPath = "acme/backend") {
  return prisma.board_gitlab_projects.create({
    data: { board_id: boardId, instance_url: "https://gitlab.com", project_path: projectPath },
  });
}

function commit(boardId: string, todoId: string, linkId: string, sha = SHA) {
  return {
    board_id: boardId,
    todo_id: todoId,
    link_id: linkId,
    sha,
    title: "API-1 fix",
    message: "API-1 fix",
    author_name: "Ada",
    committed_at: new Date("2026-10-05T18:26:21Z"),
    matched_ref: "API-1",
  };
}

describe("board_gitlab_projects", () => {
  it("lets one GitLab project be linked to several boards", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");

    await link(alice.boardId);
    await link(bob.boardId);

    expect(await prisma.board_gitlab_projects.count()).toBe(2);
  });

  it("refuses the same project twice on one board, whatever its case", async () => {
    const alice = await makeUser("alice");

    await link(alice.boardId, "Acme/Backend");

    await expect(link(alice.boardId, "acme/backend")).rejects.toThrow();
  });

  it("refuses a second link pinned to the same project id on one board", async () => {
    const alice = await makeUser("alice");
    const first = await link(alice.boardId, "acme/backend");
    const second = await link(alice.boardId, "acme/backend-renamed");

    await prisma.board_gitlab_projects.update({ where: { id: first.id }, data: { gitlab_project_id: 87263834n } });

    await expect(
      prisma.board_gitlab_projects.update({ where: { id: second.id }, data: { gitlab_project_id: 87263834n } }),
    ).rejects.toThrow();
  });

  it("refuses a sealed token without the time it was set", async () => {
    const alice = await makeUser("alice");
    const row = await link(alice.boardId);

    await expect(
      prisma.board_gitlab_projects.update({ where: { id: row.id }, data: { signing_token_sealed: "v1.a.b.c" } }),
    ).rejects.toThrow();
  });

  it.each([
    ["an http instance", { instance_url: "http://gitlab.com" }],
    ["an instance with a path", { instance_url: "https://gitlab.com/acme" }],
    ["a project path without a namespace", { project_path: "backend" }],
    ["a project path with a space", { project_path: "acme/back end" }],
  ])("refuses %s", async (_label, overrides) => {
    const alice = await makeUser("alice");

    await expect(
      prisma.board_gitlab_projects.create({
        data: { board_id: alice.boardId, instance_url: "https://gitlab.com", project_path: "acme/backend", ...overrides },
      }),
    ).rejects.toThrow();
  });
});

describe("todo_gitlab_commits", () => {
  it("stores a commit once per work item and link, however often it is inserted", async () => {
    const alice = await makeUser("alice");
    const todoId = await createCard(alice, alice.boardId);
    const { id: linkId } = await link(alice.boardId);

    const first = await prisma.todo_gitlab_commits.createMany({
      data: [commit(alice.boardId, todoId, linkId)],
      skipDuplicates: true,
    });
    const again = await prisma.todo_gitlab_commits.createMany({
      data: [commit(alice.boardId, todoId, linkId)],
      skipDuplicates: true,
    });

    expect([first.count, again.count]).toEqual([1, 0]);
    expect(await prisma.todo_gitlab_commits.count()).toBe(1);
  });

  it("refuses a link writing to another board's work item", async () => {
    const alice = await makeUser("alice");
    const mallory = await makeUser("mallory");
    const aliceTodo = await createCard(alice, alice.boardId);
    const { id: malloryLink } = await link(mallory.boardId);

    await expect(
      prisma.todo_gitlab_commits.create({ data: commit(alice.boardId, aliceTodo, malloryLink) }),
    ).rejects.toThrow();
    await expect(
      prisma.todo_gitlab_commits.create({ data: commit(mallory.boardId, aliceTodo, malloryLink) }),
    ).rejects.toThrow();
    expect(await prisma.todo_gitlab_commits.count()).toBe(0);
  });

  it("refuses a malformed sha", async () => {
    const alice = await makeUser("alice");
    const todoId = await createCard(alice, alice.boardId);
    const { id: linkId } = await link(alice.boardId);

    await expect(
      prisma.todo_gitlab_commits.create({ data: commit(alice.boardId, todoId, linkId, "74BE48FB") }),
    ).rejects.toThrow();
  });
});

describe("cascades", () => {
  async function seeded() {
    const alice = await makeUser("alice");
    const todoId = await createCard(alice, alice.boardId);
    const { id: linkId } = await link(alice.boardId);
    const base = { board_id: alice.boardId, todo_id: todoId, link_id: linkId, matched_ref: "API-1" };

    await prisma.todo_gitlab_commits.create({ data: commit(alice.boardId, todoId, linkId) });
    await prisma.todo_gitlab_branches.create({
      data: { ...base, name: "feature/API-1", head_sha: SHA, pushed_at: new Date() },
    });
    await prisma.todo_gitlab_merge_requests.create({
      data: {
        ...base,
        iid: 1,
        title: "API-1",
        state: "opened",
        source_branch: "feature/API-1",
        target_branch: "main",
        gitlab_updated_at: new Date(),
      },
    });

    return { alice, todoId, linkId };
  }

  async function remaining(): Promise<number[]> {
    return Promise.all([
      prisma.todo_gitlab_commits.count(),
      prisma.todo_gitlab_branches.count(),
      prisma.todo_gitlab_merge_requests.count(),
    ]);
  }

  it("unlinking removes that link's development records", async () => {
    const { linkId } = await seeded();

    await prisma.board_gitlab_projects.delete({ where: { id: linkId } });

    expect(await remaining()).toEqual([0, 0, 0]);
  });

  it("unlinking one board leaves another board's records for the same project", async () => {
    const { linkId } = await seeded();
    const bob = await makeUser("bob");
    const bobTodo = await createCard(bob, bob.boardId);
    const { id: bobLink } = await link(bob.boardId);

    await prisma.todo_gitlab_commits.create({ data: commit(bob.boardId, bobTodo, bobLink) });
    await prisma.board_gitlab_projects.delete({ where: { id: linkId } });

    expect(await prisma.todo_gitlab_commits.findMany({ select: { link_id: true } })).toEqual([
      { link_id: bobLink },
    ]);
  });

  it("deleting the work item removes its development records", async () => {
    const { alice, todoId } = await seeded();

    const deleted = await client.del(`/api/v1/todos/${todoId}`, undefined, { token: alice.token });

    expect(deleted.status).toBe(204);
    expect(await remaining()).toEqual([0, 0, 0]);
    expect(await prisma.board_gitlab_projects.count()).toBe(1);
  });

  it("deleting the board removes the link and everything under it", async () => {
    const { alice } = await seeded();

    const deleted = await client.del(`/api/v1/boards/${alice.boardId}`, undefined, { token: alice.token });

    expect(deleted.status).toBe(204);
    expect(await remaining()).toEqual([0, 0, 0]);
    expect(await prisma.board_gitlab_projects.count()).toBe(0);
  });
});

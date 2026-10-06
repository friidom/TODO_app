import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../db/prisma.js";
import { sealSecret } from "../../lib/secretBox.js";
import { disconnect, resetDatabase } from "../../testing/db.js";
import { makeUser, type TestUser } from "../../testing/fixtures.js";
import {
  PROJECT,
  deliver,
  mergeRequestPayload,
  pushPayload,
  signedDelivery,
  signingToken,
  type Delivery,
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

const REFUSED = { error: { code: "unauthorized", message: "Webhook delivery refused." } };

interface Link {
  id: string;
  status: string;
  project_path: string;
  project_url: string;
}

async function linkedProject(
  user: TestUser,
  { projectUrl = "https://gitlab.com/acme/backend", token = signingToken() as string | null } = {},
): Promise<{ link: Link; token: string }> {
  const connected = await client.post<{ link: Link }>(
    `/api/v1/boards/${user.boardId}/integrations/gitlab`,
    { project_url: projectUrl },
    { token: user.token },
  );

  if (connected.status !== 201) throw new Error(`connect failed: ${connected.status}`);

  if (token !== null) {
    const saved = await client.put(
      `/api/v1/boards/${user.boardId}/integrations/gitlab/${connected.body.link.id}/signing-token`,
      { token },
      { token: user.token },
    );

    if (saved.status !== 200) throw new Error(`token failed: ${saved.status}`);
  }

  return { link: connected.body.link, token: token ?? "" };
}

function row(linkId: string) {
  return prisma.board_gitlab_projects.findUniqueOrThrow({ where: { id: linkId } });
}

async function statusOf(user: TestUser): Promise<string | undefined> {
  const listed = await client.get<Link[]>(`/api/v1/boards/${user.boardId}/integrations/gitlab`, {
    token: user.token,
  });

  return listed.body[0]?.status;
}

const push = () => pushPayload({ commits: [{ message: "MB-1 fix authentication" }] });

function withoutHeader(delivery: Delivery, name: string): Delivery {
  const headers = { ...delivery.headers };

  delete headers[name];

  return { ...delivery, headers };
}

describe("accepting a delivery", () => {
  it("accepts a signed push from the linked project and pins the project", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);

    const response = await deliver(client.url, link.id, signedDelivery(token, push()));

    expect(response).toMatchObject({ status: 200, body: { status: "processed", event: "push" } });

    const stored = await row(link.id);

    expect(stored.gitlab_project_id).toBe(BigInt(PROJECT.id));
    expect(stored.project_web_url).toBe(PROJECT.web_url);
    expect(stored.last_delivery_at).not.toBeNull();
    expect(stored.last_failure_at).toBeNull();
    expect(await statusOf(alice)).toBe("active");
  });

  it("accepts a merge request event", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);

    const response = await deliver(
      client.url,
      link.id,
      signedDelivery(token, mergeRequestPayload({ title: "MB-1 fix" }), { event: "Merge Request Hook" }),
    );

    expect(response).toMatchObject({ status: 200, body: { status: "processed", event: "merge_request" } });
  });

  it("acknowledges other events from the linked project without acting on them", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);
    const note = { object_kind: "note", project: PROJECT, object_attributes: { note: "MB-1" } };

    const response = await deliver(client.url, link.id, signedDelivery(token, note, { event: "Note Hook" }));

    expect(response).toEqual({ status: 200, body: { status: "ignored" } });
    expect((await row(link.id)).last_delivery_at).not.toBeNull();
  });

  it("accepts when one of several signatures is GitLab's", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);
    const genuine = signedDelivery(token, push());
    const forged = signedDelivery(signingToken(), push(), {
      id: genuine.headers["webhook-id"],
      timestamp: Number(genuine.headers["webhook-timestamp"]),
    });

    genuine.headers["webhook-signature"] = `${forged.headers["webhook-signature"]} ${genuine.headers["webhook-signature"]}`;

    expect((await deliver(client.url, link.id, genuine)).status).toBe(200);
  });

  it("follows a project renamed in GitLab once it has been pinned", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);

    await deliver(client.url, link.id, signedDelivery(token, push()));

    const renamed = { ...PROJECT, path_with_namespace: "acme/core-api", web_url: "https://gitlab.com/acme/core-api" };
    const response = await deliver(
      client.url,
      link.id,
      signedDelivery(token, pushPayload({ project: renamed, commits: [{ message: "MB-2" }] })),
    );

    expect(response.status).toBe(200);

    const listed = await client.get<Link[]>(`/api/v1/boards/${alice.boardId}/integrations/gitlab`, {
      token: alice.token,
    });

    expect(listed.body[0]).toMatchObject({
      project_path: "acme/core-api",
      project_url: "https://gitlab.com/acme/core-api",
    });
  });
});

describe("a link without a signing token yet", () => {
  it("answers 200 and records nothing, so GitLab does not count a failure", async () => {
    const alice = await makeUser("alice");
    const { link } = await linkedProject(alice, { token: null });

    const response = await deliver(client.url, link.id, signedDelivery(signingToken(), push()));

    expect(response).toEqual({ status: 200, body: { status: "ignored" } });

    const stored = await row(link.id);

    expect([stored.gitlab_project_id, stored.last_delivery_at, stored.last_failure_at]).toEqual([null, null, null]);
  });
});

describe("refusing a delivery", () => {
  it.each([
    ["an unknown link", () => randomUUID()],
    ["a malformed link id", () => "not-a-link"],
  ])("answers the same 401 for %s", async (_label, linkId) => {
    const response = await deliver(client.url, linkId(), signedDelivery(signingToken(), push()));

    expect(response).toEqual({ status: 401, body: REFUSED });
  });

  async function refusedWith(mutate: (delivery: Delivery, token: string) => Delivery) {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);

    const response = await deliver(client.url, link.id, mutate(signedDelivery(token, push()), token));
    const stored = await row(link.id);

    return { alice, response, stored };
  }

  it.each([
    ["signed with another token", () => signedDelivery(signingToken(), push()), "signature"],
    [
      "a body changed after signing",
      (d: Delivery) => ({ ...d, body: Buffer.from(d.body.toString().replace("MB-1", "MB-9")) }),
      "signature",
    ],
    [
      "a timestamp ten minutes old",
      (_d: Delivery, token: string) =>
        signedDelivery(token, push(), { timestamp: Math.floor(Date.now() / 1000) - 600 }),
      "timestamp",
    ],
    [
      "a timestamp ten minutes ahead",
      (_d: Delivery, token: string) =>
        signedDelivery(token, push(), { timestamp: Math.floor(Date.now() / 1000) + 600 }),
      "timestamp",
    ],
    ["no signature header", (d: Delivery) => withoutHeader(d, "webhook-signature"), "headers"],
    ["no webhook-id header", (d: Delivery) => withoutHeader(d, "webhook-id"), "headers"],
  ])("refuses a delivery %s with the same 401, and records why", async (_label, mutate, reason) => {
    const { alice, response, stored } = await refusedWith(mutate);

    expect(response).toEqual({ status: 401, body: REFUSED });
    expect(stored.last_failure_reason).toBe(reason);
    expect(stored.gitlab_project_id).toBeNull();
    expect(stored.last_delivery_at).toBeNull();
    expect(await statusOf(alice)).toBe("failing");
  });

  it("recovers to active after the next good delivery", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);

    await deliver(client.url, link.id, signedDelivery(signingToken(), push()));
    expect(await statusOf(alice)).toBe("failing");

    await deliver(client.url, link.id, signedDelivery(token, push()));
    expect(await statusOf(alice)).toBe("active");
  });

  it.each([
    ["not JSON", Buffer.from("{not json")],
    ["a push without its commits", Buffer.from(JSON.stringify({ ...push(), commits: "none" }))],
    ["a push with a malformed sha", Buffer.from(JSON.stringify({ ...push(), after: "XYZ" }))],
  ])("answers 400 to a signed payload that is %s", async (_label, body) => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);

    const response = await deliver(client.url, link.id, signedDelivery(token, body));

    expect(response).toEqual({
      status: 400,
      body: { error: { code: "bad_request", message: "Malformed webhook payload." } },
    });
    expect((await row(link.id)).last_failure_reason).toBe("payload");
  });

  it("refuses a body over 2 MB before reading it", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);

    const response = await deliver(client.url, link.id, signedDelivery(token, Buffer.alloc(2 * 1024 * 1024 + 1, 32)));

    expect(response.status).toBe(400);
    expect((await row(link.id)).last_failure_at).toBeNull();
  });
});

describe("checking the project", () => {
  const CONFLICT = {
    status: 409,
    body: { error: { code: "conflict", message: "This webhook belongs to a different GitLab project." } },
  };

  it("refuses a first delivery from a project other than the one connected", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);
    const other = { ...PROJECT, id: 1, path_with_namespace: "acme/frontend", web_url: "https://gitlab.com/acme/frontend" };

    const response = await deliver(client.url, link.id, signedDelivery(token, pushPayload({ project: other })));

    expect(response).toEqual(CONFLICT);
    expect((await row(link.id)).gitlab_project_id).toBeNull();
    expect((await row(link.id)).last_failure_reason).toBe("project");
  });

  it("refuses another project id once pinned, even under the same path", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);

    await deliver(client.url, link.id, signedDelivery(token, push()));

    const impostor = { ...PROJECT, id: PROJECT.id + 1 };
    const response = await deliver(client.url, link.id, signedDelivery(token, pushPayload({ project: impostor })));

    expect(response).toEqual(CONFLICT);
    expect((await row(link.id)).gitlab_project_id).toBe(BigInt(PROJECT.id));
  });

  it("refuses a delivery from another GitLab instance", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);
    const delivery = signedDelivery(token, push());

    delivery.headers["x-gitlab-instance"] = "https://gitlab.example.com";

    expect(await deliver(client.url, link.id, delivery)).toEqual(CONFLICT);
  });

  it("refuses a project whose address is on another host", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);
    const elsewhere = { ...PROJECT, web_url: "https://evil.example.com/acme/backend" };

    expect(
      await deliver(client.url, link.id, signedDelivery(token, pushPayload({ project: elsewhere }))),
    ).toEqual(CONFLICT);
  });
});

describe("keeping boards apart", () => {
  it("does not accept one board's token on another board's link to the same project", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    const aliceLink = await linkedProject(alice);
    const bobLink = await linkedProject(bob);

    expect(await deliver(client.url, bobLink.link.id, signedDelivery(aliceLink.token, push()))).toEqual({
      status: 401,
      body: REFUSED,
    });
    expect((await deliver(client.url, bobLink.link.id, signedDelivery(bobLink.token, push()))).status).toBe(200);
  });
});

describe("a token Veylo can no longer read", () => {
  it("is reported on the link and answered 200, not as a GitLab failure", async () => {
    const alice = await makeUser("alice");
    const { link, token } = await linkedProject(alice);

    await prisma.board_gitlab_projects.update({
      where: { id: link.id },
      data: { signing_token_sealed: sealSecret(token, randomBytes(32), `board_gitlab_projects:${link.id}`) },
    });

    const response = await deliver(client.url, link.id, signedDelivery(token, push()));

    expect(response).toEqual({ status: 200, body: { status: "ignored" } });
    expect((await row(link.id)).last_failure_reason).toBe("token");
  });
});

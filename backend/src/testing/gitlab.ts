import { createHmac, randomBytes, randomUUID } from "node:crypto";

// Payloads shaped like the GitLab.com deliveries captured in Phase 3A, with
// every person and project replaced, and signed exactly the way GitLab signs.

export const PROJECT = {
  id: 87263834,
  path_with_namespace: "acme/backend",
  web_url: "https://gitlab.com/acme/backend",
};

export const ZERO_SHA = "0".repeat(40);

export function signingToken(): string {
  return `whsec_${randomBytes(32).toString("base64")}`;
}

export function sha(seed: string): string {
  return createHmac("sha1", "fixture").update(seed).digest("hex");
}

export interface CommitInput {
  message: string;
  id?: string;
  timestamp?: string;
  author?: string;
}

function commit({ message, id = sha(message), timestamp = "2026-10-05T18:26:21+00:00", author = "Ada Lovelace" }: CommitInput) {
  return {
    id,
    message,
    title: message.split("\n")[0],
    timestamp,
    url: `${PROJECT.web_url}/-/commit/${id}`,
    author: { name: author, email: "ada@example.invalid" },
    added: [],
    modified: ["README.md"],
    removed: [],
  };
}

export function pushPayload({
  ref = "refs/heads/main",
  before = sha("before"),
  after,
  commits = [],
  project = PROJECT,
}: {
  ref?: string;
  before?: string;
  after?: string;
  commits?: CommitInput[];
  project?: typeof PROJECT;
} = {}) {
  const built = commits.map(commit);

  return {
    object_kind: "push",
    event_name: "push",
    before,
    after: after ?? built.at(-1)?.id ?? sha("after"),
    ref,
    checkout_sha: after ?? built.at(-1)?.id ?? null,
    user_name: "Ada Lovelace",
    user_username: "ada",
    user_email: "ada@example.invalid",
    project_id: project.id,
    project: { ...project, name: "backend", namespace: "acme", default_branch: "main" },
    commits: built,
    total_commits_count: built.length,
    repository: { name: "backend", homepage: project.web_url },
  };
}

export function mergeRequestPayload({
  iid = 1,
  title,
  description = "",
  state = "opened",
  action = "open",
  sourceBranch = "feature/work",
  targetBranch = "main",
  updatedAt = "2026-10-05T18:27:44.310Z",
  project = PROJECT,
}: {
  iid?: number;
  title: string;
  description?: string | null;
  state?: string;
  action?: string;
  sourceBranch?: string;
  targetBranch?: string;
  updatedAt?: string;
  project?: typeof PROJECT;
}) {
  return {
    object_kind: "merge_request",
    event_type: "merge_request",
    user: { name: "Ada Lovelace", username: "ada" },
    project: { ...project, name: "backend", namespace: "acme", default_branch: "main" },
    object_attributes: {
      iid,
      title,
      description,
      state,
      action,
      source_branch: sourceBranch,
      target_branch: targetBranch,
      url: `${project.web_url}/-/merge_requests/${iid}`,
      created_at: "2026-10-05T18:27:43.355Z",
      updated_at: updatedAt,
    },
  };
}

export interface Delivery {
  headers: Record<string, string>;
  body: Buffer;
}

export function signedDelivery(
  token: string,
  payload: unknown,
  {
    id = randomUUID(),
    timestamp = Math.floor(Date.now() / 1000),
    event = "Push Hook",
  }: { id?: string; timestamp?: number; event?: string } = {},
): Delivery {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
  const key = Buffer.from(token.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest("base64");

  return {
    body,
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
      "x-gitlab-event": event,
      "x-gitlab-instance": "https://gitlab.com",
    },
  };
}

export async function deliver(
  baseUrl: string,
  linkId: string,
  { headers, body }: Delivery,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}/api/v1/integrations/gitlab/webhooks/${linkId}`, {
    method: "POST",
    headers,
    body: new Uint8Array(body),
  });
  const text = await response.text();

  return { status: response.status, body: text === "" ? undefined : JSON.parse(text) };
}

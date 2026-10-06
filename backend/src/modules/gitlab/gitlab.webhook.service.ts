import { AppError, uniqueConstraintOf } from "../../lib/errors.js";
import { openSecret, SecretBoxError } from "../../lib/secretBox.js";
import { verifyWebhookSignature } from "../../lib/webhookSignature.js";
import { ingestMergeRequest, ingestPush, type PushResult } from "./gitlab.ingest.service.js";
import { parseEvent, type GitLabProject } from "./gitlab.payload.js";
import * as gitlabRepo from "./gitlab.repo.js";
import type { DeliveryLink } from "./gitlab.repo.js";
import { integrationKey, tokenContext } from "./gitlab.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DeliveryHeaders {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  instance: string | undefined;
}

export type DeliveryOutcome =
  | { status: "ignored" }
  | ({ status: "processed"; event: "push" } & PushResult)
  | { status: "processed"; event: "merge_request"; merge_requests: number };

// One answer for an unknown link, a malformed one and a delivery that fails
// verification, so the endpoint tells a prober nothing about which it hit.
function refused(): AppError {
  return new AppError("unauthorized", "Webhook delivery refused.");
}

function openToken(linkId: string, sealed: string): string | null {
  const key = integrationKey();

  if (key === null) return null;

  try {
    return openSecret(sealed, key, tokenContext(linkId));
  } catch (error) {
    if (error instanceof SecretBoxError) return null;

    throw error;
  }
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLinkedProject(link: DeliveryLink, project: GitLabProject, instanceHeader: string | undefined): boolean {
  if (instanceHeader !== undefined && originOf(instanceHeader) !== link.instance_url) return false;

  if (originOf(project.web_url) !== link.instance_url) return false;

  // After the first delivery the numeric id is what counts: it survives the
  // renames and transfers that change the path.
  if (link.gitlab_project_id !== null) return BigInt(project.id) === link.gitlab_project_id;

  return project.path_with_namespace.toLowerCase() === link.project_path.toLowerCase();
}

async function acceptProject(link: DeliveryLink, project: GitLabProject, now: Date): Promise<boolean> {
  try {
    return (await gitlabRepo.acceptDelivery(link.id, BigInt(project.id), project.web_url, now)) > 0;
  } catch (error) {
    if (uniqueConstraintOf(error) === "board_gitlab_projects_board_project_key") return false;

    throw error;
  }
}

export async function receiveDelivery(
  linkId: string,
  headers: DeliveryHeaders,
  body: Buffer,
  now: Date = new Date(),
): Promise<DeliveryOutcome> {
  if (!UUID.test(linkId)) throw refused();

  const link = await gitlabRepo.findLinkForDelivery(linkId);

  if (link === null) throw refused();

  // Half-configured, not failed: GitLab disables a webhook that keeps failing,
  // and the admin has simply not pasted the token yet.
  if (link.signing_token_sealed === null) return { status: "ignored" };

  const token = openToken(link.id, link.signing_token_sealed);

  if (token === null) {
    await gitlabRepo.recordFailure(link.id, "token", now);

    return { status: "ignored" };
  }

  const verification = verifyWebhookSignature(
    { id: headers.id, timestamp: headers.timestamp, signature: headers.signature, body },
    token,
    { now: now.getTime() },
  );

  if (!verification.ok) {
    await gitlabRepo.recordFailure(link.id, verification.reason === "secret" ? "token" : verification.reason, now);

    throw refused();
  }

  let payload: unknown;

  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    payload = undefined;
  }

  const parsed = parseEvent(payload);

  if (parsed.kind === "invalid") {
    await gitlabRepo.recordFailure(link.id, "payload", now);

    throw new AppError("bad_request", "Malformed webhook payload.");
  }

  const project = parsed.kind === "other" ? parsed.project : parsed.event.project;

  if (project === null) return { status: "ignored" };

  if (!isLinkedProject(link, project, headers.instance) || !(await acceptProject(link, project, now))) {
    await gitlabRepo.recordFailure(link.id, "project", now);

    throw new AppError("conflict", "This webhook belongs to a different GitLab project.");
  }

  if (parsed.kind === "other") return { status: "ignored" };

  if (parsed.kind === "push") {
    return { status: "processed", event: "push", ...(await ingestPush(link, parsed.event, verification.sentAt)) };
  }

  return { status: "processed", event: "merge_request", ...(await ingestMergeRequest(link, parsed.event)) };
}

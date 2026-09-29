import { randomUUID } from "node:crypto";

import { prisma } from "../db/prisma.js";
import { withActor } from "../db/withActor.js";
import type { BoardRole } from "../lib/permissions.js";
import { signAccessToken } from "../lib/tokens.js";
import type { WorkflowStage } from "../lib/workflow.js";
import { provisionUser } from "../modules/users/users.service.js";
import type { PublishWorkflowInput } from "../modules/workflow/workflow.schema.js";
import { snapshot as workflowSnapshot } from "../modules/workflow/workflow.service.js";

export interface TestUser {
  id: string;
  email: string;
  username: string;
  // Provisioning gives every account one board; most tests need no other.
  boardId: string;
  token: string;
}

// Built through provisionUser rather than raw inserts, so a fixture account
// has the board, space, four columns and owner membership a real one has —
// and so a change to provisioning shows up here instead of drifting.
export async function makeUser(name = "user"): Promise<TestUser> {
  const id = randomUUID();
  const suffix = id.slice(0, 8);
  const email = `${name}-${suffix}@test.invalid`;
  const username = `${name}_${suffix}`.toLowerCase().replace(/[^a-z0-9_]/g, "");

  await withActor(id, async (tx) => {
    await tx.users.create({ data: { id, email, password_hash: "not-a-real-hash" } });
    await provisionUser(tx, { id, email, username });
  });

  const board = await prisma.boards.findFirstOrThrow({
    where: { owner_id: id },
    select: { id: true },
  });

  const profile = await prisma.profiles.findUniqueOrThrow({
    where: { id },
    select: { username: true },
  });

  return { id, email, username: profile.username, boardId: board.id, token: signAccessToken(id).accessToken };
}

export async function addMember(
  boardId: string,
  user: TestUser,
  role: BoardRole,
  actorId = user.id,
): Promise<void> {
  await withActor(actorId, (tx) =>
    tx.board_members.create({ data: { board_id: boardId, user_id: user.id, role } }),
  );
}

export function firstColumnOf(boardId: string): Promise<{ id: string }> {
  return prisma.columns.findFirstOrThrow({
    where: { board_id: boardId },
    orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { position: "asc" }],
    select: { id: true },
  });
}

export interface TestStatus {
  id: string;
  column_id: string;
  name: string;
  category: string;
}

const STATUS_FIELDS = { id: true, column_id: true, name: true, category: true } as const;

// Provisioning gives each column exactly one status, so the first column's
// status is as well defined as the first column was.
export async function firstStatusOf(boardId: string): Promise<TestStatus> {
  const column = await firstColumnOf(boardId);

  const status = await prisma.statuses.findFirstOrThrow({
    where: { board_id: boardId, column_id: column.id },
    orderBy: { rank: "asc" },
    select: STATUS_FIELDS,
  });

  return { ...status, column_id: column.id };
}

// One status per stage on a provisioned board: To Do, In Progress, In Review,
// Done.
export async function stageStatuses(
  boardId: string,
): Promise<{ todo: string; inProgress: string; inReview: string; done: string }> {
  const statuses = await prisma.statuses.findMany({
    where: { board_id: boardId },
    select: STATUS_FIELDS,
  });

  const of = (category: string): string => {
    const status = statuses.find((it) => it.category === category);

    if (!status) throw new Error(`no ${category} status: ${JSON.stringify(statuses)}`);

    return status.id;
  };

  return {
    todo: of("todo"),
    inProgress: of("in_progress"),
    inReview: of("in_review"),
    done: of("done"),
  };
}

// The publish body that reproduces the board's workflow exactly as it is, for a
// test to edit and PUT.
export async function workflowDraft(boardId: string): Promise<PublishWorkflowInput> {
  const snapshot = await workflowSnapshot(boardId);

  return {
    version: snapshot.workflow_version,
    columns: snapshot.columns.map((column) => ({ id: column.id, title: column.title ?? "Untitled" })),
    statuses: snapshot.statuses.map((status) => ({
      id: status.id,
      column_id: status.column_id,
      name: status.name,
      category: status.category as WorkflowStage,
      is_hidden: status.is_hidden,
    })),
    transitions: snapshot.transitions,
    migrations: [],
  };
}

import { withActor } from "../../db/withActor.js";
import { AppError } from "../../lib/errors.js";
import { assignableRoles, canActOnMember, type BoardRole } from "../../lib/permissions.js";
import type { Actor } from "../../types/actor.js";
import { emitInvalidate } from "../../realtime/emit.js";
import { evictFromBoard } from "../../realtime/rooms.js";
import * as membersRepo from "./members.repo.js";
import type { AddMemberInput, SetMemberRoleInput } from "./members.schema.js";

export interface BoardContext {
  id: string;
  role: BoardRole;
}

function forbidden(message: string): AppError {
  return new AppError("forbidden", message);
}

function notAMember(): AppError {
  return new AppError("not_found", "That person is not a member of this board.");
}

export function roster(board: BoardContext): Promise<membersRepo.RosterEntry[]> {
  return membersRepo.roster(board.id);
}

// The owner test runs before any rank arithmetic this service does, which is
// the ordering add_board_member's comment insists on: it must not sit behind a
// rank branch, or an implementation that gets the arithmetic slightly wrong
// lets an admin through to the owner.
export async function add(
  actor: Actor,
  board: BoardContext,
  input: AddMemberInput,
): Promise<membersRepo.RosterEntry> {
  if (await membersRepo.isOwner(board.id, input.user_id)) {
    throw forbidden("The board owner cannot be modified.");
  }

  if (!assignableRoles(board.role).includes(input.role)) {
    throw forbidden("You cannot grant a role at or above your own.");
  }

  if (!(await membersRepo.profileExists(input.user_id))) {
    throw new AppError("bad_request", "No such user.");
  }

  const added = await withActor(actor.id, (tx) =>
    membersRepo.insertIfAbsent(tx, board.id, input.user_id, input.role),
  );

  if (!added) {
    throw new AppError(
      "conflict",
      "That person is already a member of this board; change their role instead.",
    );
  }

  emitInvalidate(board.id, ["members"]);

  return entryFor(board.id, input.user_id);
}

export async function setRole(
  actor: Actor,
  board: BoardContext,
  userId: string,
  input: SetMemberRoleInput,
): Promise<membersRepo.RosterEntry> {
  if (await membersRepo.isOwner(board.id, userId)) {
    throw forbidden("The board owner cannot be modified.");
  }

  if (!assignableRoles(board.role).includes(input.role)) {
    throw forbidden("You cannot grant a role at or above your own.");
  }

  await withActor(actor.id, async (tx) => {
    const current = await membersRepo.lockMembership(tx, board.id, userId);

    if (current === null) throw notAMember();

    // Both directions: the role they hold now, and the role they would get.
    if (!canActOnMember(board.role, current)) {
      throw forbidden("You cannot modify a member at or above your own role.");
    }

    await membersRepo.updateRole(tx, board.id, userId, input.role);
  });

  // No eviction: every board role may read, so a downgrade changes the verbs
  // this person has and not whether they may watch the board.
  emitInvalidate(board.id, ["members"]);

  return entryFor(board.id, userId);
}

export async function remove(
  actor: Actor,
  board: BoardContext,
  userId: string,
): Promise<void> {
  if (await membersRepo.isOwner(board.id, userId)) {
    throw forbidden("The board owner cannot be removed.");
  }

  await withActor(actor.id, async (tx) => {
    const current = await membersRepo.lockMembership(tx, board.id, userId);

    if (current === null) throw notAMember();

    if (!canActOnMember(board.role, current)) {
      throw forbidden("You cannot remove a member at or above your own role.");
    }

    await membersRepo.remove(tx, board.id, userId);
  });

  // After the commit, never inside it: a rollback that had already evicted
  // would log someone out of a board they are still a member of.
  await evictFromBoard(board.id, userId);
  emitInvalidate(board.id, ["members"]);
}

// Takes no target: leave_board cannot be pointed at anyone else, which is what
// keeps it out of the administration matrix entirely.
export async function leave(actor: Actor, board: BoardContext): Promise<void> {
  if (board.role === "owner") {
    throw forbidden("The board owner cannot leave the board.");
  }

  await withActor(actor.id, (tx) => membersRepo.remove(tx, board.id, actor.id));

  await evictFromBoard(board.id, actor.id);
  emitInvalidate(board.id, ["members"]);
}

async function entryFor(boardId: string, userId: string): Promise<membersRepo.RosterEntry> {
  const entry = (await membersRepo.roster(boardId)).find((row) => row.id === userId);

  if (entry === undefined) throw notAMember();

  return entry;
}

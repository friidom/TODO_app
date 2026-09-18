import type { NextFunction, Request, RequestHandler, Response } from "express";

import { prisma } from "../db/prisma.js";
import { AppError } from "../lib/errors.js";
import type { BoardRole } from "../lib/permissions.js";
import { roleOf } from "../modules/members/members.repo.js";
import { requireActor } from "./requireAuth.js";

// 404, NOT 403, for a non-member — and the same 404 for a board that does not
// exist. RLS returned an empty set today, so a non-member cannot tell the two
// apart; a 403 would turn every id in the system into an existence oracle
// ("this board is real, you just can't have it"). Do not "fix" this to a 403.
function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One shared resolver for every route that names a child instead of a board.
// Each entry answers only "which board does this row belong to" — the
// membership check then runs on the answer, which is what stops a pasted id
// from another board reading anything.
const CHILD_RESOLVERS = {
  columnId: (id: string) =>
    prisma.columns.findUnique({ where: { id }, select: { board_id: true } }),
  todoId: (id: string) => prisma.todos.findUnique({ where: { id }, select: { board_id: true } }),
  sprintId: (id: string) => prisma.sprints.findUnique({ where: { id }, select: { board_id: true } }),
  commentId: (id: string) =>
    prisma.comments.findUnique({ where: { id }, select: { board_id: true } }),
  attachmentId: (id: string) =>
    prisma.attachments.findUnique({ where: { id }, select: { board_id: true } }),
  inviteId: (id: string) =>
    prisma.board_invites.findUnique({ where: { id }, select: { board_id: true } }),
} as const;

type ChildParam = keyof typeof CHILD_RESOLVERS;

const CHILD_PARAMS = Object.keys(CHILD_RESOLVERS) as ChildParam[];

type Resolution =
  | { kind: "board"; boardId: string }
  | { kind: "missing" }
  // No :boardId and no child id: the route was mounted behind boardAccess
  // without anything for it to resolve. A wiring bug, not a client error.
  | { kind: "unwired" };

async function resolveBoardId(req: Request, skip: ChildParam | undefined): Promise<Resolution> {
  const params = req.params as Record<string, string | undefined>;
  const declared = params.boardId;
  const children = CHILD_PARAMS.filter((name) => name !== skip && params[name] !== undefined);

  if (declared === undefined && children.length === 0) return { kind: "unwired" };

  // A malformed id cannot name a row, so it gets the same answer as one that
  // names a row you may not see. It also keeps a bad uuid out of the query,
  // where it would surface as a 22P02.
  if (declared !== undefined && !UUID.test(declared)) return { kind: "missing" };

  // EVERY child id present is resolved, and all of them — plus :boardId when
  // it is there — must name the same board. Resolving only the first would
  // authorize against one row and leave the rest unchecked, so a route like
  // /todos/:todoId/comments/:commentId would accept a comment from any board.
  let agreed = declared;

  for (const name of children) {
    const childId = params[name]!;

    if (!UUID.test(childId)) return { kind: "missing" };

    const row = await CHILD_RESOLVERS[name](childId);

    if (row === null) return { kind: "missing" };

    if (agreed !== undefined && row.board_id !== agreed) return { kind: "missing" };

    agreed = row.board_id;
  }

  // Unreachable: the guard above returns when there is nothing to resolve.
  if (agreed === undefined) return { kind: "unwired" };

  return { kind: "board", boardId: agreed };
}

interface BoardAccessOptions {
  // The child id this route upserts, and may therefore name before the row
  // exists. §12.3 requires a PATCH on a todo whose insert is still in flight
  // to CREATE it; the strict resolver would 404 that before the handler ran,
  // which presents as a board that looks right and then silently reverts.
  //
  // The skipped id is never looked up, so this middleware no longer proves it
  // belongs to req.board.id. THE HANDLER MUST SCOPE BY (id, board_id) — an
  // upsert keyed on `id` alone lets one board overwrite another board's row.
  //
  // The route must also carry :boardId, or there is nothing left to resolve
  // and it answers 500 rather than authorizing nothing.
  mayNotExist?: ChildParam;
}

// requireAuth → boardAccess(…) → requireRole(…) → validate(…) → handler.
// Sets req.board for everything downstream; nothing after this may read a
// board id from the request again.
export function boardAccess(options: BoardAccessOptions = {}): RequestHandler {
  return async function resolveBoardAccess(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const actorId = requireActor(req);
      const resolved = await resolveBoardId(req, options.mayNotExist);

      if (resolved.kind === "unwired") {
        throw new AppError("internal", "Internal server error");
      }

      if (resolved.kind === "missing") {
        next(notFound());

        return;
      }

      const role = await roleOf(resolved.boardId, actorId);

      if (role === null) {
        next(notFound());

        return;
      }

      req.board = { id: resolved.boardId, role };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireBoard(req: Request): { id: string; role: BoardRole } {
  if (req.board === undefined) {
    throw new AppError("internal", "Internal server error");
  }

  return req.board;
}

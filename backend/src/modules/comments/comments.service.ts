import { randomUUID } from "node:crypto";

import { AppError } from "../../lib/errors.js";
import { canDeleteComment, canEditComment } from "../../lib/permissions.js";
import type { Actor } from "../../types/actor.js";
import type { BoardContext } from "../members/members.service.js";
import * as commentsRepo from "./comments.repo.js";
import type { CommentRow } from "./comments.repo.js";
import type { CreateCommentInput, UpdateCommentInput } from "./comments.schema.js";

function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

export function list(board: BoardContext, todoId: string): Promise<CommentRow[]> {
  return commentsRepo.findByTodo(board.id, todoId);
}

// No withActor: nothing on comments reads app.actor_id.
export function create(
  actor: Actor,
  board: BoardContext,
  todoId: string,
  input: CreateCommentInput,
): Promise<CommentRow> {
  return commentsRepo.insert({
    id: input.id ?? randomUUID(),
    boardId: board.id,
    todoId,
    authorId: actor.id,
    content: input.content,
  });
}

// Authorship is not a rank, so this cannot live in requireRole: no role widens
// it, because rewriting someone else's words is not moderation.
export async function update(
  actor: Actor,
  board: BoardContext,
  commentId: string,
  input: UpdateCommentInput,
): Promise<CommentRow> {
  const comment = await commentsRepo.findOne(board.id, commentId);

  if (comment === null) throw notFound();

  if (!canEditComment(actor.id, comment.author_id)) {
    throw new AppError("forbidden", "You can only edit your own comments.");
  }

  if ((await commentsRepo.updateContent(board.id, commentId, input.content)) === 0) {
    throw notFound();
  }

  const updated = await commentsRepo.findOne(board.id, commentId);

  if (updated === null) throw notFound();

  return updated;
}

export async function remove(
  actor: Actor,
  board: BoardContext,
  commentId: string,
): Promise<void> {
  const comment = await commentsRepo.findOne(board.id, commentId);

  if (comment === null) throw notFound();

  if (!canDeleteComment(board.role, actor.id, comment.author_id)) {
    throw new AppError("forbidden", "You can only delete your own comments.");
  }

  if ((await commentsRepo.remove(board.id, commentId)) === 0) throw notFound();
}

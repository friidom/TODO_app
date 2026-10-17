import { randomUUID } from "node:crypto";

import { AppError } from "../../lib/errors.js";
import { canDeleteComment, canEditComment } from "../../lib/permissions.js";
import { emitChange, emitDeleted } from "../../realtime/emit.js";
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
export async function create(
  actor: Actor,
  board: BoardContext,
  todoId: string,
  input: CreateCommentInput,
): Promise<CommentRow> {
  const created = await commentsRepo.insert({
    id: input.id ?? randomUUID(),
    boardId: board.id,
    todoId,
    authorId: actor.id,
    content: input.content,
  });

  emitChange(board.id, "comment", "INSERT", created);

  return created;
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

  emitChange(board.id, "comment", "UPDATE", updated);

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

  emitDeleted(board.id, "comment", commentId);
}

// Curation of the shared thread rather than an edit of anyone's words, so it
// is a rank (editor, at the route) and not the author rule above.
export async function setPinned(
  actor: Actor,
  board: BoardContext,
  commentId: string,
  pinned: boolean,
): Promise<CommentRow> {
  const comment = await commentsRepo.findOne(board.id, commentId);

  if (comment === null) throw notFound();

  if (pinned) {
    const result = await commentsRepo.pin(board.id, comment.todo_id, commentId, actor.id);

    if (result === "full") {
      throw new AppError(
        "conflict",
        `A work item can have up to ${commentsRepo.MAX_PINS} pinned comments. Unpin one first.`,
      );
    }
  } else {
    await commentsRepo.unpin(commentId);
  }

  const updated = await commentsRepo.findOne(board.id, commentId);

  if (updated === null) throw notFound();

  emitChange(board.id, "comment", "UPDATE", updated);

  return updated;
}

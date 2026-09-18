import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

const COMMENT_FIELDS = {
  id: true,
  board_id: true,
  todo_id: true,
  author_id: true,
  content: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.commentsSelect;

export type CommentRow = Prisma.commentsGetPayload<{ select: typeof COMMENT_FIELDS }>;

// Ascending: a thread reads top-down. The activity feeds are the opposite, and
// getting either direction wrong is invisible in a one-row fixture.
export function findByTodo(boardId: string, todoId: string): Promise<CommentRow[]> {
  return prisma.comments.findMany({
    where: { board_id: boardId, todo_id: todoId },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: COMMENT_FIELDS,
  });
}

export function findOne(boardId: string, commentId: string): Promise<CommentRow | null> {
  return prisma.comments.findFirst({
    where: { id: commentId, board_id: boardId },
    select: COMMENT_FIELDS,
  });
}

export interface CommentInsert {
  id: string;
  boardId: string;
  todoId: string;
  authorId: string;
  content: string;
}

export function insert(comment: CommentInsert): Promise<CommentRow> {
  return prisma.comments.create({
    data: {
      id: comment.id,
      board_id: comment.boardId,
      todo_id: comment.todoId,
      author_id: comment.authorId,
      content: comment.content,
    },
    select: COMMENT_FIELDS,
  });
}

// content is the only column this writes, which is what `grant update (content)`
// used to guarantee: without that whitelist an author editing their own comment
// could also backdate created_at or move the comment to another card, in the
// same request.
export async function updateContent(
  boardId: string,
  commentId: string,
  content: string,
): Promise<number> {
  const { count } = await prisma.comments.updateMany({
    where: { id: commentId, board_id: boardId },
    data: { content },
  });

  return count;
}

export async function remove(boardId: string, commentId: string): Promise<number> {
  const { count } = await prisma.comments.deleteMany({
    where: { id: commentId, board_id: boardId },
  });

  return count;
}

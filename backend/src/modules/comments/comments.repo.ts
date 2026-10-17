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
  comment_pins: { select: { created_at: true } },
} satisfies Prisma.commentsSelect;

type CommentRecord = Prisma.commentsGetPayload<{ select: typeof COMMENT_FIELDS }>;

export type CommentRow = Omit<CommentRecord, "comment_pins"> & { pinned_at: Date | null };

function toRow({ comment_pins, ...record }: CommentRecord): CommentRow {
  return { ...record, pinned_at: comment_pins?.created_at ?? null };
}

// Ascending: a thread reads top-down. The activity feeds are the opposite, and
// getting either direction wrong is invisible in a one-row fixture.
export async function findByTodo(boardId: string, todoId: string): Promise<CommentRow[]> {
  const rows = await prisma.comments.findMany({
    where: { board_id: boardId, todo_id: todoId },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: COMMENT_FIELDS,
  });

  return rows.map(toRow);
}

export async function findOne(boardId: string, commentId: string): Promise<CommentRow | null> {
  const row = await prisma.comments.findFirst({
    where: { id: commentId, board_id: boardId },
    select: COMMENT_FIELDS,
  });

  return row === null ? null : toRow(row);
}

export interface CommentInsert {
  id: string;
  boardId: string;
  todoId: string;
  authorId: string;
  content: string;
}

export async function insert(comment: CommentInsert): Promise<CommentRow> {
  const row = await prisma.comments.create({
    data: {
      id: comment.id,
      board_id: comment.boardId,
      todo_id: comment.todoId,
      author_id: comment.authorId,
      content: comment.content,
    },
    select: COMMENT_FIELDS,
  });

  return toRow(row);
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

export const MAX_PINS = 5;

// Under a lock on the work item's row, so two pins at once cannot both see four
// and both take the fifth slot. A comment already pinned is left as it is.
export function pin(
  boardId: string,
  todoId: string,
  commentId: string,
  actorId: string,
): Promise<"pinned" | "full"> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      select 1 from public.todos
       where id = ${todoId}::uuid and board_id = ${boardId}::uuid
         for update
    `;

    if (await tx.comment_pins.findUnique({ where: { comment_id: commentId } })) {
      return "pinned";
    }

    const count = await tx.comment_pins.count({
      where: { comments: { board_id: boardId, todo_id: todoId } },
    });

    if (count >= MAX_PINS) return "full";

    await tx.comment_pins.create({ data: { comment_id: commentId, pinned_by: actorId } });

    return "pinned";
  });
}

export async function unpin(commentId: string): Promise<void> {
  await prisma.comment_pins.deleteMany({ where: { comment_id: commentId } });
}

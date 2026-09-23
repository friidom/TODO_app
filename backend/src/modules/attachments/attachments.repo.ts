import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

const ATTACHMENT_FIELDS = {
  id: true,
  board_id: true,
  todo_id: true,
  uploader_id: true,
  filename: true,
  storage_path: true,
  size_bytes: true,
  mime_type: true,
  created_at: true,
} satisfies Prisma.attachmentsSelect;

export type AttachmentRow = Prisma.attachmentsGetPayload<{ select: typeof ATTACHMENT_FIELDS }>;

// Descending, unlike a comment thread: a file list answers "what was added
// last", not "how did this conversation go".
export function findByTodo(boardId: string, todoId: string): Promise<AttachmentRow[]> {
  return prisma.attachments.findMany({
    where: { board_id: boardId, todo_id: todoId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: ATTACHMENT_FIELDS,
  });
}

// todoId as well as boardId: boardAccess proves the attachment and the todo
// share a board, not that the attachment hangs off this todo.
export function findOne(
  boardId: string,
  todoId: string,
  attachmentId: string,
): Promise<AttachmentRow | null> {
  return prisma.attachments.findFirst({
    where: { id: attachmentId, board_id: boardId, todo_id: todoId },
    select: ATTACHMENT_FIELDS,
  });
}

export interface AttachmentInsert {
  id: string;
  boardId: string;
  todoId: string;
  uploaderId: string;
  filename: string;
  storagePath: string;
  sizeBytes: number;
  mimeType: string;
}

export function insert(attachment: AttachmentInsert): Promise<AttachmentRow> {
  return prisma.attachments.create({
    data: {
      id: attachment.id,
      board_id: attachment.boardId,
      todo_id: attachment.todoId,
      uploader_id: attachment.uploaderId,
      filename: attachment.filename,
      storage_path: attachment.storagePath,
      size_bytes: attachment.sizeBytes,
      mime_type: attachment.mimeType,
    },
    select: ATTACHMENT_FIELDS,
  });
}

export async function remove(
  boardId: string,
  todoId: string,
  attachmentId: string,
): Promise<number> {
  const { count } = await prisma.attachments.deleteMany({
    where: { id: attachmentId, board_id: boardId, todo_id: todoId },
  });

  return count;
}

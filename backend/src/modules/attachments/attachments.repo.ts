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
  attachment_pins: { select: { created_at: true } },
} satisfies Prisma.attachmentsSelect;

type AttachmentRecord = Prisma.attachmentsGetPayload<{ select: typeof ATTACHMENT_FIELDS }>;

export type AttachmentRow = Omit<AttachmentRecord, "attachment_pins"> & {
  pinned_at: Date | null;
};

function toRow({ attachment_pins, ...record }: AttachmentRecord): AttachmentRow {
  return { ...record, pinned_at: attachment_pins?.created_at ?? null };
}

// Descending, unlike a comment thread: a file list answers "what was added
// last", not "how did this conversation go".
export async function findByTodo(boardId: string, todoId: string): Promise<AttachmentRow[]> {
  const rows = await prisma.attachments.findMany({
    where: { board_id: boardId, todo_id: todoId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: ATTACHMENT_FIELDS,
  });

  return rows.map(toRow);
}

// todoId as well as boardId: boardAccess proves the attachment and the todo
// share a board, not that the attachment hangs off this todo.
export async function findOne(
  boardId: string,
  todoId: string,
  attachmentId: string,
): Promise<AttachmentRow | null> {
  const row = await prisma.attachments.findFirst({
    where: { id: attachmentId, board_id: boardId, todo_id: todoId },
    select: ATTACHMENT_FIELDS,
  });

  return row === null ? null : toRow(row);
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

export async function insert(attachment: AttachmentInsert): Promise<AttachmentRow> {
  const row = await prisma.attachments.create({
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

  return toRow(row);
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

export const MAX_PINS = 5;

// Locked on the work item's row for the same reason comments.repo's pin is.
export function pin(
  boardId: string,
  todoId: string,
  attachmentId: string,
  actorId: string,
): Promise<"pinned" | "full"> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      select 1 from public.todos
       where id = ${todoId}::uuid and board_id = ${boardId}::uuid
         for update
    `;

    if (await tx.attachment_pins.findUnique({ where: { attachment_id: attachmentId } })) {
      return "pinned";
    }

    const count = await tx.attachment_pins.count({
      where: { attachments: { board_id: boardId, todo_id: todoId } },
    });

    if (count >= MAX_PINS) return "full";

    await tx.attachment_pins.create({
      data: { attachment_id: attachmentId, pinned_by: actorId },
    });

    return "pinned";
  });
}

export async function unpin(attachmentId: string): Promise<void> {
  await prisma.attachment_pins.deleteMany({ where: { attachment_id: attachmentId } });
}

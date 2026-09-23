import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import { minioStorage } from "../../infrastructure/storage/minio-storage.js";
import { AppError } from "../../lib/errors.js";
import { canDeleteAttachment } from "../../lib/permissions.js";
import type { Actor } from "../../types/actor.js";
import type { BoardContext } from "../members/members.service.js";
import {
  FALLBACK_MIME,
  canRenderInline,
  safeFilename,
  storageKey,
} from "./attachments.files.js";
import * as attachmentsRepo from "./attachments.repo.js";
import type { AttachmentRow } from "./attachments.repo.js";
import type { AttachmentContentQuery } from "./attachments.schema.js";

function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

export function list(board: BoardContext, todoId: string): Promise<AttachmentRow[]> {
  return attachmentsRepo.findByTodo(board.id, todoId);
}

// No todo lookup: boardAccess resolved :todoId to this board before the handler
// ran, so the card provably exists and is one the actor may reach.
//
// Object first, then the row. The reverse leaves bytes nothing points at —
// invisible, unreachable, permanent. This order fails to a row whose object is
// missing, which is visible and deletable; the catch narrows even that to a
// storage write the database then refused.
export async function create(
  actor: Actor,
  board: BoardContext,
  todoId: string,
  file: Express.Multer.File,
): Promise<AttachmentRow> {
  const id = randomUUID();
  const filename = safeFilename(file.originalname);
  const mimeType = file.mimetype || FALLBACK_MIME;
  const path = storageKey(board.id, todoId, id, filename);

  await minioStorage.upload(path, file.buffer, mimeType);

  try {
    return await attachmentsRepo.insert({
      id,
      boardId: board.id,
      todoId,
      uploaderId: actor.id,
      filename,
      storagePath: path,
      sizeBytes: file.size,
      mimeType,
    });
  } catch (error) {
    // Swallowed: the caller needs the error that failed the insert, not this.
    await minioStorage.delete(path).catch(() => {});

    throw error;
  }
}

export interface AttachmentContent {
  row: AttachmentRow;
  inline: boolean;
  stream: Readable;
}

export async function open(
  board: BoardContext,
  todoId: string,
  attachmentId: string,
  disposition: AttachmentContentQuery["disposition"],
): Promise<AttachmentContent> {
  const row = await attachmentsRepo.findOne(board.id, todoId, attachmentId);

  if (row === null) throw notFound();

  return {
    row,
    inline: disposition === "inline" && canRenderInline(row.mime_type),
    stream: await minioStorage.download(row.storage_path),
  };
}

// Uploader-or-moderator is not a rank, so it cannot live in requireRole.
export async function remove(
  actor: Actor,
  board: BoardContext,
  todoId: string,
  attachmentId: string,
): Promise<void> {
  const row = await attachmentsRepo.findOne(board.id, todoId, attachmentId);

  if (row === null) throw notFound();

  if (!canDeleteAttachment(board.role, actor.id, row.uploader_id)) {
    throw new AppError("forbidden", "You can only delete files you uploaded.");
  }

  await minioStorage.delete(row.storage_path);

  if ((await attachmentsRepo.remove(board.id, todoId, attachmentId)) === 0) throw notFound();
}

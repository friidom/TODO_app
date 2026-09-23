import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import { AppError } from "../../lib/errors.js";
import { FALLBACK_MIME, contentDisposition } from "./attachments.files.js";
import * as attachmentsService from "./attachments.service.js";
import type { AttachmentContentQuery, AttachmentParams } from "./attachments.schema.js";
import type { TodoParams } from "../todos/todos.schema.js";

export const list: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;

  res.json(await attachmentsService.list(requireBoard(req), todoId));
};

export const upload: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;

  if (req.file === undefined) {
    throw new AppError("bad_request", "No file was uploaded.");
  }

  res
    .status(201)
    .json(
      await attachmentsService.create(
        { id: requireActor(req) },
        requireBoard(req),
        todoId,
        req.file,
      ),
    );
};

export const content: RequestHandler = async (req, res) => {
  const { todoId, attachmentId } = req.params as AttachmentParams;
  // as unknown as: `disposition` is a literal union once parsed, which no
  // longer overlaps ParsedQs's index signature.
  const { disposition } = req.query as unknown as AttachmentContentQuery;

  const { row, inline, stream } = await attachmentsService.open(
    requireBoard(req),
    todoId,
    attachmentId,
    disposition,
  );

  // octet-stream unless the file is one canRenderInline vouched for, so a
  // stored text/html can never be served as something a browser will run.
  res.setHeader("Content-Type", inline ? row.mime_type : FALLBACK_MIME);
  res.setHeader("Content-Length", row.size_bytes);
  res.setHeader(
    "Content-Disposition",
    contentDisposition(inline ? "inline" : "attachment", row.filename),
  );
  res.setHeader("Cache-Control", "private, no-store");

  // Headers are already out by the first chunk, so errorHandler cannot answer
  // with JSON; aborting is the only way to tell the client it is truncated.
  stream.on("error", (error) => res.destroy(error));

  stream.pipe(res);
};

export const remove: RequestHandler = async (req, res) => {
  const { todoId, attachmentId } = req.params as AttachmentParams;

  await attachmentsService.remove(
    { id: requireActor(req) },
    requireBoard(req),
    todoId,
    attachmentId,
  );

  res.status(204).end();
};

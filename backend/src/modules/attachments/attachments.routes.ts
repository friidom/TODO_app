import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { todoParamsSchema } from "../todos/todos.schema.js";
import * as controller from "./attachments.controller.js";
import {
  attachmentContentQuerySchema,
  attachmentParamsSchema,
} from "./attachments.schema.js";
import { uploadSingleAttachment } from "./attachments.upload.js";

// Mounted at /todos/:todoId/attachments. requireRole("editor") is canAttach:
// a viewer reads and downloads every file and adds none, which is the one
// place attachments and comments deliberately disagree.
export const todoAttachmentsRoutes = Router({ mergeParams: true });

todoAttachmentsRoutes.get(
  "/",
  requireAuth,
  boardAccess(),
  validate({ params: todoParamsSchema }),
  controller.list,
);

// multer runs last: an unauthorized request must be refused before 10 MB is
// buffered into this process's memory.
todoAttachmentsRoutes.post(
  "/",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: todoParamsSchema }),
  uploadSingleAttachment,
  controller.upload,
);

todoAttachmentsRoutes.get(
  "/:attachmentId/content",
  requireAuth,
  boardAccess(),
  validate({ params: attachmentParamsSchema, query: attachmentContentQuerySchema }),
  controller.content,
);

// Uploader-or-moderator is not a rank, so it is checked in the service.
todoAttachmentsRoutes.delete(
  "/:attachmentId",
  requireAuth,
  boardAccess(),
  validate({ params: attachmentParamsSchema }),
  controller.remove,
);

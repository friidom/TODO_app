import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import { todoParamsSchema } from "../todos/todos.schema.js";
import * as controller from "./comments.controller.js";
import {
  commentParamsSchema,
  createCommentSchema,
  updateCommentSchema,
} from "./comments.schema.js";

// Mounted at /todos/:todoId/comments. No requireRole on either: canComment is
// true for every role including viewer, which is where comments and
// attachments deliberately disagree.
export const todoCommentsRoutes = Router({ mergeParams: true });

todoCommentsRoutes.get(
  "/",
  requireAuth,
  boardAccess(),
  validate({ params: todoParamsSchema }),
  controller.list,
);

todoCommentsRoutes.post(
  "/",
  requireAuth,
  boardAccess(),
  validate({ params: todoParamsSchema, body: createCommentSchema }),
  controller.create,
);

// Author and moderator rules are not ranks, so they live in the service.
export const commentsRoutes = Router();

commentsRoutes.patch(
  "/:commentId",
  requireAuth,
  boardAccess(),
  validate({ params: commentParamsSchema, body: updateCommentSchema }),
  controller.update,
);

commentsRoutes.delete(
  "/:commentId",
  requireAuth,
  boardAccess(),
  validate({ params: commentParamsSchema }),
  controller.remove,
);

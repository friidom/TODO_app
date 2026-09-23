import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./todos.controller.js";
import { todoActivitiesRoutes } from "../activities/activities.routes.js";
import { todoCommentsRoutes } from "../comments/comments.routes.js";
import { createTodoSchema, moveTodoSchema, todoParamsSchema, upsertTodoSchema } from "./todos.schema.js";
import { todoAttachmentsRoutes } from "../attachments/attachments.routes.js";

export const boardTodosRoutes = Router({ mergeParams: true });

boardTodosRoutes.get("/", requireAuth, boardAccess(), controller.list);

boardTodosRoutes.post(
  "/",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ body: createTodoSchema }),
  controller.create,
);

// The upsert route, and the only user of mayNotExist. It lives under
// /boards/:boardId because with :todoId skipped there would otherwise be
// nothing left for boardAccess to resolve.
boardTodosRoutes.patch(
  "/:todoId",
  requireAuth,
  boardAccess({ mayNotExist: "todoId" }),
  requireRole("editor"),
  validate({ params: todoParamsSchema, body: upsertTodoSchema }),
  controller.upsert,
);

export const todosRoutes = Router();

todosRoutes.get(
  "/:todoId",
  requireAuth,
  boardAccess(),
  validate({ params: todoParamsSchema }),
  controller.get,
);

todosRoutes.post(
  "/:todoId/move",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: todoParamsSchema, body: moveTodoSchema }),
  controller.move,
);

todosRoutes.delete(
  "/:todoId",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: todoParamsSchema }),
  controller.remove,
);

todosRoutes.use("/:todoId/comments", todoCommentsRoutes);
todosRoutes.use("/:todoId/activities", todoActivitiesRoutes);
todosRoutes.use("/:todoId/attachments", todoAttachmentsRoutes);

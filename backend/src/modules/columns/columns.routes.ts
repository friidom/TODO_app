import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./columns.controller.js";
import {
  columnParamsSchema,
  createColumnSchema,
  deleteColumnSchema,
  moveColumnSchema,
  updateColumnSchema,
} from "./columns.schema.js";

export const boardColumnsRoutes = Router({ mergeParams: true });

boardColumnsRoutes.get("/", requireAuth, boardAccess(), controller.list);

boardColumnsRoutes.post(
  "/",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ body: createColumnSchema }),
  controller.create,
);

// Declared before /:columnId/rebalance so the literal segment wins.
boardColumnsRoutes.post(
  "/rebalance",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  controller.rebalanceBoard,
);

boardColumnsRoutes.post(
  "/:columnId/rebalance",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: columnParamsSchema }),
  controller.rebalanceColumnTodos,
);

export const columnsRoutes = Router();

columnsRoutes.patch(
  "/:columnId",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: columnParamsSchema, body: updateColumnSchema }),
  controller.update,
);

columnsRoutes.post(
  "/:columnId/move",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: columnParamsSchema, body: moveColumnSchema }),
  controller.move,
);

columnsRoutes.delete(
  "/:columnId",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: columnParamsSchema, body: deleteColumnSchema }),
  controller.remove,
);

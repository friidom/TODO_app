import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./columns.controller.js";
import { columnParamsSchema, updateColumnSchema } from "./columns.schema.js";

// Creating, renaming, reordering and deleting a column are workflow changes and
// go through PUT /boards/:boardId/workflow. What is left here is a column's
// advisory WIP limits and the respacing of its cards' ranks, neither of which
// changes the workflow.
export const boardColumnsRoutes = Router({ mergeParams: true });

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

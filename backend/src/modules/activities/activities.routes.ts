import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import { todoParamsSchema } from "../todos/todos.schema.js";
import * as controller from "./activities.controller.js";
import { activityQuerySchema, todoActivityQuerySchema } from "./activities.schema.js";

// Read only, on both routes. activities is trigger-written and has no API write
// path at all, which is what makes an entry evidence rather than a claim.
export const boardActivitiesRoutes = Router({ mergeParams: true });

boardActivitiesRoutes.get(
  "/",
  requireAuth,
  boardAccess(),
  validate({ query: activityQuerySchema }),
  controller.listForBoard,
);

export const todoActivitiesRoutes = Router({ mergeParams: true });

todoActivitiesRoutes.get(
  "/",
  requireAuth,
  boardAccess(),
  validate({ params: todoParamsSchema, query: todoActivityQuerySchema }),
  controller.listForTodo,
);

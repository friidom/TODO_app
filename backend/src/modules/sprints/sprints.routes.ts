import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./sprints.controller.js";
import {
  completeSprintSchema,
  createSprintSchema,
  sprintParamsSchema,
  updateSprintSchema,
} from "./sprints.schema.js";

export const boardSprintsRoutes = Router({ mergeParams: true });

boardSprintsRoutes.get("/", requireAuth, boardAccess(), controller.list);

boardSprintsRoutes.post(
  "/",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ body: createSprintSchema }),
  controller.create,
);

// Both transitions are SECURITY INVOKER in the SQL, which means they carried no
// authorization of their own and relied entirely on RLS. requireRole("editor")
// is that gate, and it runs before the bulk write rather than after it.
export const sprintsRoutes = Router();

sprintsRoutes.patch(
  "/:sprintId",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: sprintParamsSchema, body: updateSprintSchema }),
  controller.update,
);

sprintsRoutes.delete(
  "/:sprintId",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: sprintParamsSchema }),
  controller.remove,
);

sprintsRoutes.post(
  "/:sprintId/start",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: sprintParamsSchema }),
  controller.start,
);

sprintsRoutes.post(
  "/:sprintId/complete",
  requireAuth,
  boardAccess(),
  requireRole("editor"),
  validate({ params: sprintParamsSchema, body: completeSprintSchema }),
  controller.complete,
);

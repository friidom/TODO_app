import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./workflow.controller.js";
import { publishWorkflowSchema } from "./workflow.schema.js";

export const boardWorkflowRoutes = Router({ mergeParams: true });

boardWorkflowRoutes.get("/", requireAuth, boardAccess(), controller.get);

// admin+, matching permissions.ts#canManageWorkflow. An editor moves work
// through the workflow; only an admin or the owner changes its shape.
boardWorkflowRoutes.put(
  "/",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ body: publishWorkflowSchema }),
  controller.publish,
);

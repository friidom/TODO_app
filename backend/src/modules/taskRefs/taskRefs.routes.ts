import { Router } from "express";

import { taskRefLimiter } from "../../middleware/rateLimit.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./taskRefs.controller.js";
import { taskRefParamsSchema } from "./taskRefs.schema.js";

export const taskRefsRoutes = Router();

// No boardAccess: the board is what this route finds out. The service runs the
// same membership check on the board the key names.
taskRefsRoutes.get(
  "/:ref",
  requireAuth,
  taskRefLimiter,
  validate({ params: taskRefParamsSchema }),
  controller.resolve,
);

import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./spaces.controller.js";
import { createSpaceSchema, spaceParamsSchema, updateSpaceSchema } from "./spaces.schema.js";

export const spacesRoutes = Router();

spacesRoutes.get("/", requireAuth, controller.list);

spacesRoutes.post("/", requireAuth, validate({ body: createSpaceSchema }), controller.create);

// :spaceId is validated here rather than by boardAccess, which does not apply
// to a table with no membership.
spacesRoutes.patch(
  "/:spaceId",
  requireAuth,
  validate({ params: spaceParamsSchema, body: updateSpaceSchema }),
  controller.update,
);

spacesRoutes.delete(
  "/:spaceId",
  requireAuth,
  validate({ params: spaceParamsSchema }),
  controller.remove,
);

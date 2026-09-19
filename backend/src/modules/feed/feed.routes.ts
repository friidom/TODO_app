import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./feed.controller.js";
import { byIdsQuerySchema, feedQuerySchema, workedOnQuerySchema } from "./feed.schema.js";

// The one place scoping is not a single boardId: accessibleBoardIds decides
// what these can see, and it is applied inside each query rather than after it.
export const meRoutes = Router();

meRoutes.get("/feed", requireAuth, validate({ query: feedQuerySchema }), controller.feed);

meRoutes.get(
  "/worked-on",
  requireAuth,
  validate({ query: workedOnQuerySchema }),
  controller.workedOn,
);

meRoutes.get("/todos", requireAuth, validate({ query: byIdsQuerySchema }), controller.byIds);

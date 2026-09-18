import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./feed.controller.js";
import { feedQuerySchema } from "./feed.schema.js";

// The one place scoping is not a single boardId: accessibleBoardIds decides
// what this can see, and it is applied inside the query rather than after it.
export const meRoutes = Router();

meRoutes.get("/feed", requireAuth, validate({ query: feedQuerySchema }), controller.feed);

import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import * as controller from "./stars.controller.js";

// Personal, so never response-cached and never broadcast. Any member may star,
// a viewer included: it changes nothing anyone else sees.
export const myStarsRoutes = Router();

myStarsRoutes.get("/", requireAuth, controller.listMine);

export const boardStarRoutes = Router({ mergeParams: true });

boardStarRoutes.put("/", requireAuth, boardAccess(), controller.star);
boardStarRoutes.delete("/", requireAuth, boardAccess(), controller.unstar);

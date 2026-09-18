import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./boards.controller.js";
import { createBoardSchema, updateBoardSchema } from "./boards.schema.js";

// /boards — no board exists yet, so there is nothing for boardAccess to resolve.
export const boardCollectionRoutes = Router();

boardCollectionRoutes.get("/", requireAuth, controller.list);

boardCollectionRoutes.post(
  "/",
  requireAuth,
  validate({ body: createBoardSchema }),
  controller.create,
);

// Mounted under /boards/:boardId. mergeParams or boardAccess sees no id at all
// and answers 500 (CONVENTIONS.md).
export const boardItemRoutes = Router({ mergeParams: true });

boardItemRoutes.get("/", requireAuth, boardAccess(), controller.get);

// admin+, except that boards_space_ownership independently refuses a space_id
// change by anyone but the owner, and only into a space they own.
boardItemRoutes.patch(
  "/",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ body: updateBoardSchema }),
  controller.update,
);

boardItemRoutes.delete("/", requireAuth, boardAccess(), requireRole("owner"), controller.remove);

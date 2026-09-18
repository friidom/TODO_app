import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./members.controller.js";
import { addMemberSchema, memberParamsSchema, setMemberRoleSchema } from "./members.schema.js";

export const membersRoutes = Router({ mergeParams: true });

membersRoutes.get("/", requireAuth, boardAccess(), controller.list);

membersRoutes.post(
  "/",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ body: addMemberSchema }),
  controller.add,
);

// Declared before /:userId, which would otherwise capture the literal "me".
membersRoutes.delete("/me", requireAuth, boardAccess(), controller.leave);

membersRoutes.patch(
  "/:userId",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ params: memberParamsSchema, body: setMemberRoleSchema }),
  controller.setRole,
);

membersRoutes.delete(
  "/:userId",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ params: memberParamsSchema }),
  controller.remove,
);

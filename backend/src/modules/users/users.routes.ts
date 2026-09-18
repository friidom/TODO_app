import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./users.controller.js";
import { updateProfileSchema } from "./users.schema.js";

// Self only. There is deliberately no GET /users/:userId — teammate identity
// comes from GET /boards/:boardId/members, which is membership-gated and
// returns a fixed column list (§11.2, RLS_AUDIT §327).
export const usersRoutes = Router();

usersRoutes.get("/me", requireAuth, controller.me);

usersRoutes.patch(
  "/me",
  requireAuth,
  validate({ body: updateProfileSchema }),
  controller.updateMe,
);

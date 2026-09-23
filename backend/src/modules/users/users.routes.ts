import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./users.controller.js";
import { avatarObjectParamsSchema, updateProfileSchema } from "./users.schema.js";
import { uploadSingleAvatar } from "./users.upload.js";

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

// "me", never a :userId — the avatar written is always the caller's own, so
// there is no id in the path that could name somebody else.
//
// multer runs last, after requireAuth: an unauthenticated request must be
// refused before 5 MB is buffered into this process's memory.
usersRoutes.post("/me/avatar", requireAuth, uploadSingleAvatar, controller.uploadAvatar);

usersRoutes.delete("/me/avatar", requireAuth, controller.deleteAvatar);

// Declared after /me/* so the literal segment is not swallowed by :userId.
// No requireAuth — see the controller for why an <img> cannot carry a token.
usersRoutes.get(
  "/:userId/avatar/:object",
  validate({ params: avatarObjectParamsSchema }),
  controller.avatarObject,
);

import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./notifications.controller.js";
import { markReadSchema, notificationQuerySchema } from "./notifications.schema.js";

export const notificationsRoutes = Router();

notificationsRoutes.get(
  "/",
  requireAuth,
  validate({ query: notificationQuerySchema }),
  controller.list,
);

// Literal segments, declared before anything that could capture them.
notificationsRoutes.get("/unread-count", requireAuth, controller.unreadCount);

notificationsRoutes.post(
  "/read",
  requireAuth,
  validate({ body: markReadSchema }),
  controller.markRead,
);

// The one endpoint §18.2 names: the old client relied on RLS and its UPDATE
// carried no user predicate at all, so a port that forgets one marks every
// inbox in the database read.
notificationsRoutes.post("/read-all", requireAuth, controller.markAllRead);

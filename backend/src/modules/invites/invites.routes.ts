import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./invites.controller.js";
import {
  acceptInviteSchema,
  createInviteSchema,
  declineInviteSchema,
  inviteParamsSchema,
  inviteeQuerySchema,
} from "./invites.schema.js";

export const boardInvitesRoutes = Router({ mergeParams: true });

boardInvitesRoutes.get("/", requireAuth, boardAccess(), requireRole("admin"), controller.listPending);

boardInvitesRoutes.post(
  "/",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ body: createInviteSchema }),
  controller.create,
);

export const boardInviteesRoutes = Router({ mergeParams: true });

boardInviteesRoutes.get(
  "/",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ query: inviteeQuerySchema }),
  controller.searchInvitees,
);

export const invitesRoutes = Router();

// The token travels in the body, not the path: morgan writes req.url to the
// access log, and an invite token is a bearer credential.
invitesRoutes.get("/mine", requireAuth, controller.mine);

invitesRoutes.post(
  "/accept",
  requireAuth,
  validate({ body: acceptInviteSchema }),
  controller.accept,
);

invitesRoutes.post(
  "/decline",
  requireAuth,
  validate({ body: declineInviteSchema }),
  controller.decline,
);

// boardAccess resolves :inviteId to its board and checks membership there, so
// a non-member gets the same 404 an unknown id gets.
invitesRoutes.delete(
  "/:inviteId",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ params: inviteParamsSchema }),
  controller.revoke,
);

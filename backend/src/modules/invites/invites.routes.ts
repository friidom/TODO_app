import { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { spaceParamsSchema } from "../spaces/spaces.schema.js";
import * as controller from "./invites.controller.js";
import {
  acceptInviteSchema,
  createInviteSchema,
  createSpaceInviteSchema,
  declineInviteSchema,
  inviteParamsSchema,
  inviteeQuerySchema,
  previewInviteSchema,
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

// A space has no membership for boardAccess to resolve, so these validate
// :spaceId themselves and the service answers 404 to anyone but its owner.
export const spaceInvitesRoutes = Router({ mergeParams: true });

spaceInvitesRoutes.get(
  "/",
  requireAuth,
  validate({ params: spaceParamsSchema }),
  controller.listSpacePending,
);

spaceInvitesRoutes.post(
  "/",
  requireAuth,
  validate({ params: spaceParamsSchema, body: createSpaceInviteSchema }),
  controller.createForSpace,
);

export const spaceInviteesRoutes = Router({ mergeParams: true });

spaceInviteesRoutes.get(
  "/",
  requireAuth,
  validate({ params: spaceParamsSchema, query: inviteeQuerySchema }),
  controller.searchSpaceInvitees,
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
  "/preview",
  requireAuth,
  validate({ body: previewInviteSchema }),
  controller.preview,
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

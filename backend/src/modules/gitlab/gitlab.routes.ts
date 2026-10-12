import express, { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { gitlabWebhookLimiter } from "../../middleware/rateLimit.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { spaceParamsSchema } from "../spaces/spaces.schema.js";
import { todoParamsSchema } from "../todos/todos.schema.js";
import * as controller from "./gitlab.controller.js";
import {
  connectProjectSchema,
  developmentQuerySchema,
  linkParamsSchema,
  signingTokenSchema,
  spaceLinkParamsSchema,
} from "./gitlab.schema.js";

// The space's owner, and nobody else: a space has no other role. The service
// checks ownership, because no middleware resolves a space.
export const spaceGitlabRoutes = Router({ mergeParams: true });

spaceGitlabRoutes.get("/", requireAuth, validate({ params: spaceParamsSchema }), controller.spaceIntegration);

spaceGitlabRoutes.post(
  "/",
  requireAuth,
  validate({ params: spaceParamsSchema, body: connectProjectSchema }),
  controller.connectSpace,
);

spaceGitlabRoutes.put(
  "/:linkId/signing-token",
  requireAuth,
  validate({ params: spaceLinkParamsSchema, body: signingTokenSchema }),
  controller.saveSpaceSigningToken,
);

spaceGitlabRoutes.delete(
  "/:linkId",
  requireAuth,
  validate({ params: spaceLinkParamsSchema }),
  controller.disconnectSpaceLink,
);

// Board Settings territory, so admin and above — PATCH /boards/:boardId's own
// gate. There is no connect: a board inherits its space's project. What is
// left reads that, and keeps a link made before 0035 repairable until its
// space replaces it. :linkId is not a child boardAccess knows, so each handler
// scopes by (board_id, id) itself.
export const boardGitlabRoutes = Router({ mergeParams: true });

boardGitlabRoutes.get("/", requireAuth, boardAccess(), requireRole("admin"), controller.boardIntegration);

boardGitlabRoutes.put(
  "/:linkId/signing-token",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ params: linkParamsSchema, body: signingTokenSchema }),
  controller.saveBoardSigningToken,
);

boardGitlabRoutes.delete(
  "/:linkId",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ params: linkParamsSchema }),
  controller.disconnectBoardLink,
);

// Any member may read a card's development, as they may its comments.
export const todoDevelopmentRoutes = Router({ mergeParams: true });

todoDevelopmentRoutes.get(
  "/",
  requireAuth,
  boardAccess(),
  validate({ params: todoParamsSchema, query: developmentQuerySchema }),
  controller.development,
);

// Mounted in app.ts ahead of express.json: the signature covers the exact
// bytes GitLab sent, so the body must arrive unparsed. No validate() either —
// a malformed link id gets the same 401 as an unknown one, from the service.
export const gitlabWebhookRoutes = Router();

gitlabWebhookRoutes.post(
  "/:linkId",
  gitlabWebhookLimiter,
  express.raw({ type: () => true, limit: "2mb" }),
  controller.receiveWebhook,
);

import express, { Router } from "express";

import { boardAccess } from "../../middleware/boardAccess.js";
import { gitlabWebhookLimiter } from "../../middleware/rateLimit.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { todoParamsSchema } from "../todos/todos.schema.js";
import * as controller from "./gitlab.controller.js";
import {
  connectProjectSchema,
  developmentQuerySchema,
  linkParamsSchema,
  signingTokenSchema,
} from "./gitlab.schema.js";

// Board Settings territory, so admin and above — PATCH /boards/:boardId's own
// gate. boardAccess resolves only :boardId here; :linkId is not a child it
// knows, so every handler below scopes by (board_id, id) itself.
export const boardGitlabRoutes = Router({ mergeParams: true });

boardGitlabRoutes.get("/", requireAuth, boardAccess(), requireRole("admin"), controller.listLinks);

boardGitlabRoutes.post(
  "/",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ body: connectProjectSchema }),
  controller.connect,
);

boardGitlabRoutes.put(
  "/:linkId/signing-token",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ params: linkParamsSchema, body: signingTokenSchema }),
  controller.saveSigningToken,
);

boardGitlabRoutes.delete(
  "/:linkId",
  requireAuth,
  boardAccess(),
  requireRole("admin"),
  validate({ params: linkParamsSchema }),
  controller.unlink,
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

import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as gitlabService from "./gitlab.service.js";
import * as gitlabWebhookService from "./gitlab.webhook.service.js";
import type { SpaceParams } from "../spaces/spaces.schema.js";
import type { TodoParams } from "../todos/todos.schema.js";
import type {
  ConnectProjectInput,
  DevelopmentQuery,
  LinkParams,
  SigningTokenInput,
  SpaceLinkParams,
} from "./gitlab.schema.js";

export const spaceIntegration: RequestHandler = async (req, res) => {
  const { spaceId } = req.params as SpaceParams;

  res.json(await gitlabService.spaceIntegration({ id: requireActor(req) }, spaceId));
};

export const connectSpace: RequestHandler = async (req, res) => {
  const { spaceId } = req.params as SpaceParams;

  res
    .status(201)
    .json(await gitlabService.connectSpace({ id: requireActor(req) }, spaceId, req.body as ConnectProjectInput));
};

export const saveSpaceSigningToken: RequestHandler = async (req, res) => {
  const { spaceId, linkId } = req.params as SpaceLinkParams;
  const { token } = req.body as SigningTokenInput;

  res.json(await gitlabService.saveSigningToken({ id: requireActor(req) }, { space_id: spaceId }, linkId, token));
};

export const disconnectSpaceLink: RequestHandler = async (req, res) => {
  const { spaceId, linkId } = req.params as SpaceLinkParams;

  await gitlabService.disconnect({ id: requireActor(req) }, { space_id: spaceId }, linkId);

  res.status(204).end();
};

export const boardIntegration: RequestHandler = async (req, res) => {
  res.json(await gitlabService.boardIntegration(requireBoard(req)));
};

export const saveBoardSigningToken: RequestHandler = async (req, res) => {
  const { linkId } = req.params as LinkParams;
  const { token } = req.body as SigningTokenInput;

  res.json(
    await gitlabService.saveSigningToken({ id: requireActor(req) }, { board_id: requireBoard(req).id }, linkId, token),
  );
};

export const disconnectBoardLink: RequestHandler = async (req, res) => {
  const { linkId } = req.params as LinkParams;

  await gitlabService.disconnect({ id: requireActor(req) }, { board_id: requireBoard(req).id }, linkId);

  res.status(204).end();
};

export const development: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;
  const { limit } = req.query as unknown as DevelopmentQuery;

  res.json(await gitlabService.development(requireBoard(req), todoId, limit));
};

export const receiveWebhook: RequestHandler = async (req, res) => {
  const { linkId } = req.params as { linkId: string };

  res.json(
    await gitlabWebhookService.receiveDelivery(
      linkId,
      {
        id: req.get("webhook-id"),
        timestamp: req.get("webhook-timestamp"),
        signature: req.get("webhook-signature"),
        instance: req.get("x-gitlab-instance"),
      },
      Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
    ),
  );
};

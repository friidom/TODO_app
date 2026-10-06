import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as gitlabService from "./gitlab.service.js";
import * as gitlabWebhookService from "./gitlab.webhook.service.js";
import type { TodoParams } from "../todos/todos.schema.js";
import type { ConnectProjectInput, DevelopmentQuery, LinkParams, SigningTokenInput } from "./gitlab.schema.js";

export const listLinks: RequestHandler = async (req, res) => {
  res.json(await gitlabService.list(requireBoard(req)));
};

export const connect: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json(await gitlabService.connect({ id: requireActor(req) }, requireBoard(req), req.body as ConnectProjectInput));
};

export const saveSigningToken: RequestHandler = async (req, res) => {
  const { linkId } = req.params as LinkParams;
  const { token } = req.body as SigningTokenInput;

  res.json(await gitlabService.saveSigningToken(requireBoard(req), linkId, token));
};

export const unlink: RequestHandler = async (req, res) => {
  const { linkId } = req.params as LinkParams;

  await gitlabService.unlink(requireBoard(req), linkId);

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

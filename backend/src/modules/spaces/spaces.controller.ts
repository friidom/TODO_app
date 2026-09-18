import type { RequestHandler } from "express";

import { requireActor } from "../../middleware/requireAuth.js";
import type { CreateSpaceInput, SpaceParams, UpdateSpaceInput } from "./spaces.schema.js";
import * as spacesService from "./spaces.service.js";

export const list: RequestHandler = async (req, res) => {
  res.json(await spacesService.list({ id: requireActor(req) }));
};

export const create: RequestHandler = async (req, res) => {
  const input = req.body as CreateSpaceInput;

  res.status(201).json(await spacesService.create({ id: requireActor(req) }, input));
};

export const update: RequestHandler = async (req, res) => {
  const patch = req.body as UpdateSpaceInput;
  const { spaceId } = req.params as SpaceParams;

  res.json(await spacesService.update({ id: requireActor(req) }, spaceId, patch));
};

export const remove: RequestHandler = async (req, res) => {
  const { spaceId } = req.params as SpaceParams;

  await spacesService.remove({ id: requireActor(req) }, spaceId);

  res.status(204).end();
};

import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as starsService from "./stars.service.js";

export const listMine: RequestHandler = async (req, res) => {
  res.json(await starsService.listMine({ id: requireActor(req) }));
};

export const star: RequestHandler = async (req, res) => {
  res.json(await starsService.star({ id: requireActor(req) }, requireBoard(req)));
};

export const unstar: RequestHandler = async (req, res) => {
  await starsService.unstar({ id: requireActor(req) }, requireBoard(req));

  res.status(204).end();
};

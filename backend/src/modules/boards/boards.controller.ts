import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as boardsService from "./boards.service.js";
import type { CreateBoardInput, UpdateBoardInput } from "./boards.schema.js";

// These casts assume validate() ran; boards.routes.ts wires one for every route
// that reads a body.

export const list: RequestHandler = async (req, res) => {
  res.json(await boardsService.list({ id: requireActor(req) }));
};

export const create: RequestHandler = async (req, res) => {
  const input = req.body as CreateBoardInput;

  res.status(201).json(await boardsService.create({ id: requireActor(req) }, input));
};

export const get: RequestHandler = async (req, res) => {
  res.json(await boardsService.get(requireBoard(req).id));
};

export const update: RequestHandler = async (req, res) => {
  const patch = req.body as UpdateBoardInput;

  res.json(await boardsService.update({ id: requireActor(req) }, requireBoard(req).id, patch));
};

export const remove: RequestHandler = async (req, res) => {
  await boardsService.remove({ id: requireActor(req) }, requireBoard(req).id);

  res.status(204).end();
};

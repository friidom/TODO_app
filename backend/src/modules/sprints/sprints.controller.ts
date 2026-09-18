import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as sprintsService from "./sprints.service.js";
import type {
  CompleteSprintInput,
  CreateSprintInput,
  SprintParams,
  UpdateSprintInput,
} from "./sprints.schema.js";

export const list: RequestHandler = async (req, res) => {
  res.json(await sprintsService.list(requireBoard(req)));
};

export const create: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json(
      await sprintsService.create(
        { id: requireActor(req) },
        requireBoard(req),
        req.body as CreateSprintInput,
      ),
    );
};

export const update: RequestHandler = async (req, res) => {
  const { sprintId } = req.params as SprintParams;

  res.json(
    await sprintsService.update(
      { id: requireActor(req) },
      requireBoard(req),
      sprintId,
      req.body as UpdateSprintInput,
    ),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { sprintId } = req.params as SprintParams;

  await sprintsService.remove({ id: requireActor(req) }, requireBoard(req), sprintId);

  res.status(204).end();
};

export const start: RequestHandler = async (req, res) => {
  const { sprintId } = req.params as SprintParams;

  res.json(await sprintsService.start({ id: requireActor(req) }, requireBoard(req), sprintId));
};

export const complete: RequestHandler = async (req, res) => {
  const { sprintId } = req.params as SprintParams;
  const { moveToSprintId } = req.body as CompleteSprintInput;

  res.json(
    await sprintsService.complete(
      { id: requireActor(req) },
      requireBoard(req),
      sprintId,
      moveToSprintId ?? null,
    ),
  );
};

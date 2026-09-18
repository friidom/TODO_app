import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as columnsService from "./columns.service.js";
import type {
  ColumnParams,
  CreateColumnInput,
  DeleteColumnInput,
  MoveColumnInput,
  UpdateColumnInput,
} from "./columns.schema.js";
import * as todosService from "../todos/todos.service.js";

export const list: RequestHandler = async (req, res) => {
  res.json(await columnsService.list(requireBoard(req)));
};

export const create: RequestHandler = async (req, res) => {
  const input = req.body as CreateColumnInput;

  res
    .status(201)
    .json(await columnsService.create({ id: requireActor(req) }, requireBoard(req), input));
};

export const update: RequestHandler = async (req, res) => {
  const { columnId } = req.params as ColumnParams;

  res.json(
    await columnsService.update(
      { id: requireActor(req) },
      requireBoard(req),
      columnId,
      req.body as UpdateColumnInput,
    ),
  );
};

export const move: RequestHandler = async (req, res) => {
  const { columnId } = req.params as ColumnParams;

  await columnsService.move(
    { id: requireActor(req) },
    requireBoard(req),
    columnId,
    req.body as MoveColumnInput,
  );

  res.status(204).end();
};

export const remove: RequestHandler = async (req, res) => {
  const { columnId } = req.params as ColumnParams;
  const { moveToColumnId } = req.body as DeleteColumnInput;

  await columnsService.remove(
    { id: requireActor(req) },
    requireBoard(req),
    columnId,
    moveToColumnId,
  );

  res.status(204).end();
};

export const rebalanceBoard: RequestHandler = async (req, res) => {
  const rebalanced = await columnsService.rebalance({ id: requireActor(req) }, requireBoard(req));

  res.json({ rebalanced });
};

export const rebalanceColumnTodos: RequestHandler = async (req, res) => {
  const { columnId } = req.params as ColumnParams;
  const rebalanced = await todosService.rebalanceColumn(
    { id: requireActor(req) },
    requireBoard(req),
    columnId,
  );

  res.json({ rebalanced });
};

import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as columnsService from "./columns.service.js";
import type { ColumnParams, UpdateColumnInput } from "./columns.schema.js";
import * as todosService from "../todos/todos.service.js";

export const update: RequestHandler = async (req, res) => {
  const { columnId } = req.params as ColumnParams;

  res.json(
    await columnsService.updateLimits(
      { id: requireActor(req) },
      requireBoard(req),
      columnId,
      req.body as UpdateColumnInput,
    ),
  );
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

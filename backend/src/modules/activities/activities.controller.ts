import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import type { TodoParams } from "../todos/todos.schema.js";
import * as activitiesRepo from "./activities.repo.js";
import type { ActivityQuery, TodoActivityQuery } from "./activities.schema.js";

export const listForBoard: RequestHandler = async (req, res) => {
  const { limit } = req.query as unknown as ActivityQuery;

  res.json(await activitiesRepo.findByBoard(requireBoard(req).id, limit));
};

export const listForTodo: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;
  const { limit } = req.query as unknown as TodoActivityQuery;

  res.json(await activitiesRepo.findByTodo(requireBoard(req).id, todoId, limit));
};

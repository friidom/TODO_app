import type { RequestHandler } from "express";

import { sendCached } from "../../cache/cache.js";
import { boardCache } from "../../cache/keys.js";
import { ACTIVITY_PAGE } from "../../config/constants.js";
import { requireBoard } from "../../middleware/boardAccess.js";
import type { TodoParams } from "../todos/todos.schema.js";
import * as activitiesRepo from "./activities.repo.js";
import type { ActivityQuery, TodoActivityQuery } from "./activities.schema.js";

export const listForBoard: RequestHandler = async (req, res) => {
  const { limit } = req.query as unknown as ActivityQuery;
  const boardId = requireBoard(req).id;

  // Only the page size the frontend asks for is cached, so an invalidation
  // deletes one known key instead of scanning for every limit a client sent.
  if (limit !== ACTIVITY_PAGE) {
    res.json(await activitiesRepo.findByBoard(boardId, limit));

    return;
  }

  await sendCached(res, boardCache.activities(boardId), () =>
    activitiesRepo.findByBoard(boardId, limit),
  );
};

export const listForTodo: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;
  const { limit } = req.query as unknown as TodoActivityQuery;

  res.json(await activitiesRepo.findByTodo(requireBoard(req).id, todoId, limit));
};

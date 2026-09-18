import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as commentsService from "./comments.service.js";
import type {
  CommentParams,
  CreateCommentInput,
  UpdateCommentInput,
} from "./comments.schema.js";
import type { TodoParams } from "../todos/todos.schema.js";

export const list: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;

  res.json(await commentsService.list(requireBoard(req), todoId));
};

export const create: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;

  res
    .status(201)
    .json(
      await commentsService.create(
        { id: requireActor(req) },
        requireBoard(req),
        todoId,
        req.body as CreateCommentInput,
      ),
    );
};

export const update: RequestHandler = async (req, res) => {
  const { commentId } = req.params as CommentParams;

  res.json(
    await commentsService.update(
      { id: requireActor(req) },
      requireBoard(req),
      commentId,
      req.body as UpdateCommentInput,
    ),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { commentId } = req.params as CommentParams;

  await commentsService.remove({ id: requireActor(req) }, requireBoard(req), commentId);

  res.status(204).end();
};

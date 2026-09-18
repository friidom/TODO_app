import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as todosService from "./todos.service.js";
import type {
  CreateTodoInput,
  MoveTodoInput,
  TodoParams,
  UpsertTodoInput,
} from "./todos.schema.js";

export const list: RequestHandler = async (req, res) => {
  res.json(await todosService.list(requireBoard(req)));
};

export const get: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;

  res.json(await todosService.get(requireBoard(req), todoId));
};

export const create: RequestHandler = async (req, res) => {
  const input = req.body as CreateTodoInput;

  res
    .status(201)
    .json(await todosService.create({ id: requireActor(req) }, requireBoard(req), input));
};

export const upsert: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;

  res.json(
    await todosService.upsert(
      { id: requireActor(req) },
      requireBoard(req),
      todoId,
      req.body as UpsertTodoInput,
    ),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;

  await todosService.remove({ id: requireActor(req) }, requireBoard(req), todoId);

  res.status(204).end();
};

export const move: RequestHandler = async (req, res) => {
  const { todoId } = req.params as TodoParams;

  await todosService.move(
    { id: requireActor(req) },
    requireBoard(req),
    todoId,
    req.body as MoveTodoInput,
  );

  res.status(204).end();
};

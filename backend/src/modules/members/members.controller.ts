import type { RequestHandler } from "express";

import { sendCached } from "../../cache/cache.js";
import { boardCache } from "../../cache/keys.js";
import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as membersService from "./members.service.js";
import type { AddMemberInput, MemberParams, SetMemberRoleInput } from "./members.schema.js";

export const list: RequestHandler = async (req, res) => {
  const board = requireBoard(req);

  await sendCached(res, boardCache.members(board.id), () => membersService.roster(board));
};

export const add: RequestHandler = async (req, res) => {
  const input = req.body as AddMemberInput;

  res
    .status(201)
    .json(await membersService.add({ id: requireActor(req) }, requireBoard(req), input));
};

export const setRole: RequestHandler = async (req, res) => {
  const input = req.body as SetMemberRoleInput;
  const { userId } = req.params as MemberParams;

  res.json(
    await membersService.setRole({ id: requireActor(req) }, requireBoard(req), userId, input),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { userId } = req.params as MemberParams;

  await membersService.remove({ id: requireActor(req) }, requireBoard(req), userId);

  res.status(204).end();
};

export const leave: RequestHandler = async (req, res) => {
  await membersService.leave({ id: requireActor(req) }, requireBoard(req));

  res.status(204).end();
};

import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as invitesService from "./invites.service.js";
import type {
  CreateInviteInput,
  InviteCredential,
  InviteParams,
  InviteeQuery,
} from "./invites.schema.js";

export const listPending: RequestHandler = async (req, res) => {
  res.json(await invitesService.listPending(requireBoard(req)));
};

export const create: RequestHandler = async (req, res) => {
  const input = req.body as CreateInviteInput;

  res
    .status(201)
    .json(await invitesService.create({ id: requireActor(req) }, requireBoard(req), input));
};

export const revoke: RequestHandler = async (req, res) => {
  const { inviteId } = req.params as InviteParams;

  await invitesService.revoke({ id: requireActor(req) }, requireBoard(req), inviteId);

  res.status(204).end();
};

export const mine: RequestHandler = async (req, res) => {
  res.json(await invitesService.mine({ id: requireActor(req) }));
};

export const accept: RequestHandler = async (req, res) => {
  const credential = req.body as InviteCredential;

  res.json(await invitesService.accept({ id: requireActor(req) }, credential));
};

export const decline: RequestHandler = async (req, res) => {
  const credential = req.body as InviteCredential;

  await invitesService.decline({ id: requireActor(req) }, credential);

  res.status(204).end();
};

export const searchInvitees: RequestHandler = async (req, res) => {
  const { q } = req.query as InviteeQuery;

  res.json(
    await invitesService.searchInvitees({ id: requireActor(req) }, requireBoard(req), q),
  );
};

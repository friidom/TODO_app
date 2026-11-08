import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import type { SpaceParams } from "../spaces/spaces.schema.js";
import * as invitesService from "./invites.service.js";
import type {
  CreateInviteInput,
  CreateSpaceInviteInput,
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

export const preview: RequestHandler = async (req, res) => {
  const credential = req.body as InviteCredential;

  res.json(await invitesService.preview({ id: requireActor(req) }, credential));
};

export const decline: RequestHandler = async (req, res) => {
  const credential = req.body as InviteCredential;

  await invitesService.decline({ id: requireActor(req) }, credential);

  res.status(204).end();
};

export const listSpacePending: RequestHandler = async (req, res) => {
  const { spaceId } = req.params as SpaceParams;

  res.json(await invitesService.listSpacePending({ id: requireActor(req) }, spaceId));
};

export const createForSpace: RequestHandler = async (req, res) => {
  const { spaceId } = req.params as SpaceParams;
  const input = req.body as CreateSpaceInviteInput;

  res
    .status(201)
    .json(await invitesService.createForSpace({ id: requireActor(req) }, spaceId, input));
};

export const searchSpaceInvitees: RequestHandler = async (req, res) => {
  const { spaceId } = req.params as SpaceParams;
  const { q } = req.query as InviteeQuery;

  res.json(await invitesService.searchSpaceInvitees({ id: requireActor(req) }, spaceId, q));
};

export const searchInvitees: RequestHandler = async (req, res) => {
  const { q } = req.query as InviteeQuery;

  res.json(
    await invitesService.searchInvitees({ id: requireActor(req) }, requireBoard(req), q),
  );
};

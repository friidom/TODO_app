import type { RequestHandler } from "express";

import { requireActor } from "../../middleware/requireAuth.js";
import type { UpdateProfileInput } from "./users.schema.js";
import * as usersService from "./users.service.js";

export const me: RequestHandler = async (req, res) => {
  res.json(await usersService.profileOf(requireActor(req)));
};

export const updateMe: RequestHandler = async (req, res) => {
  const patch = req.body as UpdateProfileInput;

  res.json(await usersService.updateProfile(requireActor(req), patch));
};

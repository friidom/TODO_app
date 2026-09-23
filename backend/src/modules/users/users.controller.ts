import type { RequestHandler } from "express";

import { requireActor } from "../../middleware/requireAuth.js";
import { AppError } from "../../lib/errors.js";
import type { AvatarObjectParams, UpdateProfileInput } from "./users.schema.js";
import * as usersService from "./users.service.js";

export const me: RequestHandler = async (req, res) => {
  res.json(await usersService.profileOf(requireActor(req)));
};

export const updateMe: RequestHandler = async (req, res) => {
  const patch = req.body as UpdateProfileInput;

  res.json(await usersService.updateProfile(requireActor(req), patch));
};

export const uploadAvatar: RequestHandler = async (req, res) => {
  if (req.file === undefined) throw new AppError("bad_request", "No image was uploaded.");

  res.json(await usersService.setAvatar(requireActor(req), req.file));
};

export const deleteAvatar: RequestHandler = async (req, res) => {
  res.json(await usersService.removeAvatar(requireActor(req)));
};

// Unauthenticated on purpose. profiles.avatar_url is rendered by a plain <img>
// in a dozen components, and an <img> sends no Authorization header — the
// access token lives in a JS variable, not a cookie, so there is nothing for
// this route to read. The object name is a server-minted uuid, so the url is
// unguessable, which is the same protection the Supabase public bucket this
// replaces already relied on. The bucket itself stays private.
export const avatarObject: RequestHandler = async (req, res) => {
  const { userId, object } = req.params as AvatarObjectParams;

  const { stream, contentType } = await usersService.openAvatar(userId, object);

  res.setHeader("Content-Type", contentType);
  // The object name changes on every upload, so the bytes behind one url never
  // do — which is what lets a replaced avatar appear immediately rather than
  // waiting for a cache to expire.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  stream.on("error", () => res.destroy());

  stream.pipe(res);
};

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import type { Readable } from "node:stream";

import { DEFAULT_BOARD_TITLE, DEFAULT_SPACE_TITLE } from "../../config/constants.js";
import { avatarStorage } from "../../infrastructure/storage/minio-storage.js";
import { AppError, uniqueConstraintOf } from "../../lib/errors.js";
import {
  avatarKeyFromUrl,
  avatarStorageKey,
  avatarUrl,
  isAvatarObjectName,
  sniffAvatarMime,
} from "./users.avatar.js";
import { suffixedUsername, usernameBase } from "../../lib/username.js";
import * as usersRepo from "./users.repo.js";
import type { UpdateProfileInput } from "./users.schema.js";

// Resolved rather than asserted: a collision here means the name was taken in
// the gap since availability was checked, so `ada2` beats failing the signup.
export async function resolveAvailableUsername(
  tx: Prisma.TransactionClient,
  wanted: string,
  seed: string,
): Promise<string> {
  const base = usernameBase(wanted, seed);

  let candidate = base;
  let suffix = 1;

  while (await usersRepo.usernameExists(tx, candidate)) {
    suffix += 1;
    candidate = suffixedUsername(base, suffix);
  }

  return candidate;
}

// Idempotent: a user who already owns a board gets that board back, not a
// second one.
export async function provisionUser(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string; username: string },
): Promise<string> {
  const existing = await usersRepo.firstOwnedBoardId(tx, user.id);

  if (existing !== undefined) return existing;

  const username = await resolveAvailableUsername(tx, user.username, user.id);

  await usersRepo.upsertProfile(tx, { id: user.id, email: user.email, username });

  const spaceId =
    (await usersRepo.findSpaceByTitle(tx, user.id, DEFAULT_SPACE_TITLE)) ??
    (await usersRepo.insertSpace(tx, user.id, DEFAULT_SPACE_TITLE)).id;

  // Fires add_owner_membership -> log_member_activity, which reads
  // app.actor_id, so the caller must run this inside withActor.
  const board = await usersRepo.insertBoard(tx, {
    ownerId: user.id,
    title: DEFAULT_BOARD_TITLE,
    spaceId,
  });

  await usersRepo.insertDefaultColumns(tx, board.id);

  return board.id;
}

export async function profileOf(userId: string): Promise<usersRepo.ProfileRow> {
  const profile = await usersRepo.findProfileById(userId);

  // Every account is provisioned with one, so an absent profile means the
  // account was deleted while this request carried a still-valid access token.
  if (profile === null) throw new AppError("unauthorized", "Not authenticated.");

  return profile;
}

export async function updateProfile(
  userId: string,
  patch: UpdateProfileInput,
): Promise<usersRepo.ProfileRow> {
  try {
    return await usersRepo.updateProfile(userId, patch);
  } catch (error) {
    if (uniqueConstraintOf(error) === "profiles_username_lower_key") {
      throw new AppError("conflict", "That username is already taken.");
    }

    throw error;
  }
}

// The previous object is deleted only after the profile already points at the
// new one, which is the opposite order to attachments and deliberately so:
// there, a failed insert leaves an orphan nobody can see; here, deleting first
// would leave every roster, comment and feed row rendering a broken image if
// the upload or the update then failed. An orphan is cheap; a broken avatar is
// visible to the whole team.
export async function setAvatar(
  userId: string,
  file: Express.Multer.File,
): Promise<usersRepo.ProfileRow> {
  const mime = sniffAvatarMime(file.buffer);

  // The bytes decide, not file.mimetype or the filename — both are the
  // client's to choose.
  if (mime === null) {
    throw new AppError("bad_request", "That file is not a PNG, JPEG or WebP image.");
  }

  const previous = await usersRepo.findAvatarUrl(userId);
  const avatarId = randomUUID();
  const key = avatarStorageKey(userId, avatarId, mime);

  await avatarStorage.upload(key, file.buffer, mime);

  let profile: usersRepo.ProfileRow;

  try {
    profile = await usersRepo.setAvatarUrl(userId, avatarUrl(userId, avatarId, mime));
  } catch (error) {
    // The profile still points at the old object, so the new one is the orphan.
    await avatarStorage.delete(key).catch(() => {});

    throw error;
  }

  await deleteAvatarObject(userId, previous?.avatar_url ?? null);

  return profile;
}

export async function removeAvatar(userId: string): Promise<usersRepo.ProfileRow> {
  const previous = await usersRepo.findAvatarUrl(userId);

  const profile = await usersRepo.setAvatarUrl(userId, null);

  await deleteAvatarObject(userId, previous?.avatar_url ?? null);

  return profile;
}

// Never fails the operation. An object that is already gone, a MinIO blip, or
// a leftover Supabase url that names no object here are all the same answer:
// the profile no longer points at it, which is the part that had to be true.
async function deleteAvatarObject(userId: string, url: string | null): Promise<void> {
  const key = avatarKeyFromUrl(url);

  if (key === null) return;

  // The url is stored by this server, but it is still read back out of a
  // database column before becoming a delete — so the prefix is checked rather
  // than assumed, and one account can never delete another's object.
  if (!key.startsWith(`${userId}/`)) return;

  await avatarStorage.delete(key).catch(() => {});
}

export async function openAvatar(
  userId: string,
  object: string,
): Promise<{ stream: Readable; contentType: string }> {
  if (!isAvatarObjectName(object)) throw new AppError("not_found", "Not found.");

  const key = `${userId}/${object}`;

  try {
    return {
      stream: await avatarStorage.download(key),
      // Pinned from the extension this server wrote, never from anything
      // stored with the object: the response is served from the API's own
      // origin, so the content type is what decides whether a crafted upload
      // could ever be interpreted as a document.
      contentType: object.endsWith(".png")
        ? "image/png"
        : object.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg",
    };
  } catch {
    throw new AppError("not_found", "Not found.");
  }
}

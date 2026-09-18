import { randomUUID } from "node:crypto";

import { AppError } from "../../lib/errors.js";
import type { Actor } from "../../types/actor.js";
import * as spacesRepo from "./spaces.repo.js";
import type { SpaceRow } from "./spaces.repo.js";
import type { CreateSpaceInput, UpdateSpaceInput } from "./spaces.schema.js";

function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

export function list(actor: Actor): Promise<SpaceRow[]> {
  return spacesRepo.findMany(actor.id);
}

// No withActor: nothing on spaces reads app.actor_id. boards_space_ownership
// fires on boards, not here.
export function create(actor: Actor, input: CreateSpaceInput): Promise<SpaceRow> {
  return spacesRepo.insert(actor.id, { id: input.id ?? randomUUID(), title: input.title });
}

export async function update(
  actor: Actor,
  spaceId: string,
  patch: UpdateSpaceInput,
): Promise<SpaceRow> {
  const changed = await spacesRepo.update(actor.id, spaceId, patch);

  if (changed === 0) throw notFound();

  const space = await spacesRepo.findOne(actor.id, spaceId);

  if (space === null) throw notFound();

  return space;
}

// boards.space_id is ON DELETE SET NULL, so the boards filed here are unfiled
// rather than deleted.
export async function remove(actor: Actor, spaceId: string): Promise<void> {
  if ((await spacesRepo.remove(actor.id, spaceId)) === 0) throw notFound();
}

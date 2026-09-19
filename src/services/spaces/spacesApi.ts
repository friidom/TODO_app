import { api } from "@/services/api/client";
import type { ISpace } from "@/types/data";

// A space is a folder, not a permission scope — filing a board into one grants nobody access to it.

export function getSpaces(): Promise<ISpace[]> {
  return api.get<ISpace[]>("/spaces");
}

export function createSpace({
  id = crypto.randomUUID(),
  title,
}: {
  id?: string;
  title: string;
}): Promise<ISpace> {
  return api.post<ISpace>("/spaces", { id, title });
}

export function updateSpace({
  id,
  title,
}: {
  id: string;
  title: string;
}): Promise<ISpace> {
  return api.patch<ISpace>(`/spaces/${id}`, { title });
}

// boards.space_id is on delete set null — deleting a space unfiles its boards rather than deleting them
export async function deleteSpace(id: string): Promise<{ id: string }> {
  await api.del<void>(`/spaces/${id}`);

  return { id };
}

import { ApiError, api } from "@/services/api/client";
import type { IBoard } from "@/types/data";

// space_id is patchable (moving a board between folders), key_prefix and next_key are not.
type BoardPatch = Partial<
  Pick<
    IBoard,
    "title" | "description" | "icon" | "cover_color" | "visibility" | "space_id"
  >
>;

export function getBoards(): Promise<IBoard[]> {
  return api.get<IBoard[]>("/boards");
}

// null rather than a throw for a board that does not exist or that the caller
// cannot see — both answer 404, and the caller renders "not found" either way.
export async function getBoard(id: string): Promise<IBoard | null> {
  try {
    return await api.get<IBoard>(`/boards/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;

    throw error;
  }
}

// id minted client-side so the optimistic row and the server-confirmed row are the same row.
export function createBoard({
  id = crypto.randomUUID(),
  title,
  spaceId = null,
}: {
  id?: string;
  title: string;
  spaceId?: string | null;
}): Promise<IBoard> {
  return api.post<IBoard>("/boards", { id, title, space_id: spaceId });
}

export function updateBoard({
  id,
  ...patch
}: { id: string } & BoardPatch): Promise<IBoard> {
  return api.patch<IBoard>(`/boards/${id}`, patch);
}

// Cascades take the board's columns and todos with it — nothing rehomed first, unlike deleteColumn.
export async function deleteBoard(id: string): Promise<{ id: string }> {
  await api.del<void>(`/boards/${id}`);

  return { id };
}

import { api } from "../api/client";
import type { Star } from "./starred";

export function fetchStarred(): Promise<Star[]> {
  return api.get<Star[]>("/me/starred");
}

export function starBoard(boardId: string): Promise<Star> {
  return api.put<Star>(`/boards/${boardId}/star`);
}

export async function unstarBoard(boardId: string): Promise<void> {
  await api.del<void>(`/boards/${boardId}/star`);
}

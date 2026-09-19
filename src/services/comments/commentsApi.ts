import { api } from "../api/client";
import type { Comment } from "@/types/data";

export function fetchComments(todoId: string): Promise<Comment[]> {
  return api.get<Comment[]>(`/todos/${todoId}/comments`);
}

// id is minted by the caller so the optimistic row and the stored row are the
// same row; author_id and board_id are the server's.
export function addComment({
  id,
  todo_id,
  content,
}: {
  id: string;
  board_id: string;
  todo_id: string;
  content: string;
}): Promise<Comment> {
  return api.post<Comment>(`/todos/${todo_id}/comments`, { id, content });
}

// content is the only field the endpoint writes — the rest of the row cannot be
// rewritten by an author editing their own words.
export function updateComment({
  id,
  content,
}: {
  id: string;
  content: string;
}): Promise<Comment> {
  return api.patch<Comment>(`/comments/${id}`, { content });
}

export async function deleteComment(id: string): Promise<string> {
  await api.del<void>(`/comments/${id}`);

  return id;
}

import { api } from "../api/client";

// The roster's six fields, and no more: email and bio exist on profiles and are
// deliberately withheld from co-members.
export type BoardMember = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string;
};

export function fetchBoardMembers(boardId: string): Promise<BoardMember[]> {
  return api.get<BoardMember[]>(`/boards/${boardId}/members`);
}

export async function updateMemberRole({
  boardId,
  userId,
  role,
}: {
  boardId: string;
  userId: string;
  role: string;
}): Promise<void> {
  await api.patch<BoardMember>(`/boards/${boardId}/members/${userId}`, { role });
}

// Admin removal. Self-removal is DELETE .../members/me, which the frontend has
// no surface for yet.
export async function removeBoardMember({
  boardId,
  userId,
}: {
  boardId: string;
  userId: string;
}): Promise<void> {
  await api.del<void>(`/boards/${boardId}/members/${userId}`);
}

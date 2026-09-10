import { supabase } from "../api/supabase";

// hand-written, not from the generated Database type — a Postgres TABLE-returning function loses nullability, so
// supabase gen types would call these plain string when they're actually nullable in profiles
export type BoardMember = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string;
};

// never .from("board_members").select() — that table is self-read only, would silently return just the caller's own row
export async function fetchBoardMembers(
  boardId: string,
): Promise<BoardMember[]> {
  const { data, error } = await supabase.rpc("board_roster", {
    p_board_id: boardId,
  });

  if (error) throw error;

  return data ?? [];
}

// through the RPC only — the table has no write policy, so a direct update would match zero rows and silently "succeed"
export async function updateMemberRole({
  boardId,
  userId,
  role,
}: {
  boardId: string;
  userId: string;
  role: string;
}): Promise<void> {
  const { error } = await supabase.rpc("set_member_role", {
    p_board_id: boardId,
    p_user_id: userId,
    p_role: role,
  });

  if (error) throw error;
}

// admin removal, refuses the Owner outright — self-removal is the separate leave_board RPC
export async function removeBoardMember({
  boardId,
  userId,
}: {
  boardId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("remove_board_member", {
    p_board_id: boardId,
    p_user_id: userId,
  });

  if (error) throw error;
}

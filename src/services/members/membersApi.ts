import { supabase } from "../api/supabase";

/**
 * One row of a board's roster.
 *
 * **Hand-written rather than derived from the generated `Database` type, and
 * this is the one place in the codebase where that is correct.** `board_roster`
 * is declared `returns table (…)`, and a `TABLE` signature in Postgres carries
 * no nullability information — so `supabase gen types` reports `username`,
 * `full_name` and `avatar_url` as plain `string`. All three are nullable in
 * `public.profiles`. Trusting the generated type would put a `null` behind a
 * non-null annotation and crash on the first member who never set a name.
 *
 * The plan records this as M3-13's follow-up: narrow at the API boundary
 * instead. Widening `string` to `string | null` needs no cast — it is the
 * assignment below, checked by the compiler.
 */
export type BoardMember = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string;
};

/**
 * The board's members, through the `board_roster` RPC.
 *
 * **Never `.from("board_members").select()`.** That table is self-read only by
 * design and would return the caller's own row and nothing else — a one-person
 * member list with no error to signal it. The RPC is `SECURITY DEFINER` and its
 * return list is the exposure boundary: `email` and `bio` are deliberately not
 * in it, and `profiles` RLS stays self-only rather than being widened.
 *
 * A non-member gets an empty array rather than an error, so an empty roster is
 * a legitimate state and not a failure to report.
 */
export async function fetchBoardMembers(
  boardId: string,
): Promise<BoardMember[]> {
  const { data, error } = await supabase.rpc("board_roster", {
    p_board_id: boardId,
  });

  if (error) throw error;

  return data ?? [];
}

/**
 * Change a member's role.
 *
 * **`set_member_role` is the deployed name** — not `update_member_role`, which
 * does not exist. Checked against the generated `Database["public"]["Functions"]`
 * rather than remembered.
 *
 * Through the RPC and never `.from("board_members").update()`. That table has
 * RLS on with a self-read policy and **no write policy at all**, and adding one
 * is prohibited (Permission Model, rule 4) — a direct update does not fail
 * loudly, it matches zero rows and reports success. Every authorization rule
 * lives inside the function: the caller must outrank both the target's current
 * role and the role being granted, the Owner is never a valid target, and
 * `owner` is never a grantable role.
 */
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

/**
 * Remove a member from the board.
 *
 * `remove_board_member` is administration and refuses the Owner outright.
 * Self-removal is a different operation with different authorization —
 * `leave_board`, which any non-owner member may call — and it is deliberately
 * not wired here: the roster's controls are the administrative path, and
 * folding consent into them is how the self-service exception gets widened by
 * accident.
 */
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

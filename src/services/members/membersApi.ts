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

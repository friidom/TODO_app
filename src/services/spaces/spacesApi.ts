import { supabase } from "@/services/api/supabase";
import type { ISpace } from "@/types/data";

/**
 * Spaces: the caller's own folders for boards (M15).
 *
 * **Read directly from the table, and written directly too** — unlike
 * `board_members` and `board_invites`, which have no client write policy and go
 * through `SECURITY DEFINER` RPCs. The difference is what a write means: those
 * two grant privilege, so an RPC is where the caller's rank gets checked.
 * Creating a folder grants nothing to anybody, so `owner_id = auth.uid()` in
 * RLS is the entire rule and there is no rank to check.
 *
 * A space is **not** a permission scope. Nothing here reads or writes
 * membership, and filing a board into a space gives no one access to it.
 */

/**
 * Every space the caller owns.
 *
 * No `.eq("owner_id", …)`: RLS already scopes this to the caller, and unlike
 * the board-scoped queries there is no second dimension to narrow by — the same
 * reasoning `getBoards` records.
 *
 * Ordered by title in the database rather than in the client, because the
 * sidebar renders them in exactly this order and nothing re-sorts them.
 */
export async function getSpaces(): Promise<ISpace[]> {
  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .order("title");

  if (error) throw error;

  return data;
}

/**
 * `owner_id` comes from the session, never from an argument — the same rule
 * `createBoard` follows, so a caller cannot express a space owned by someone
 * else rather than merely being refused one.
 *
 * The id is minted by the caller so an optimistic row can carry the id the
 * server will confirm.
 */
export async function createSpace({
  id = crypto.randomUUID(),
  title,
}: {
  id?: string;
  title: string;
}): Promise<ISpace> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("spaces")
    .insert({ id, title, owner_id: user.id })
    .select()
    .single();

  if (error) throw error;

  return data;
}

/** Rename. `owner_id` is deliberately not patchable. */
export async function updateSpace({
  id,
  title,
}: {
  id: string;
  title: string;
}): Promise<ISpace> {
  const { data, error } = await supabase
    .from("spaces")
    .update({ title })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

/**
 * Deletes the space. **Its boards survive.**
 *
 * `boards.space_id` is `on delete set null`, so every board inside becomes
 * unfiled and nothing else about it changes — not its members, not its cards,
 * not its key. A cascade here would let one person deleting their own folder
 * destroy boards other people are members of.
 */
export async function deleteSpace(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("spaces").delete().eq("id", id);

  if (error) throw error;

  return { id };
}

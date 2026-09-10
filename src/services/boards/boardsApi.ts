import { supabase } from "@/services/api/supabase";
import type { IBoard } from "@/types/data";

// space_id is patchable (moving a board between folders), key_prefix and next_key are not.
type BoardPatch = Partial<
  Pick<
    IBoard,
    "title" | "description" | "icon" | "cover_color" | "visibility" | "space_id"
  >
>;

export async function getBoards(): Promise<IBoard[]> {
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .order("created_at");

  if (error) throw error;

  return data;
}

// maybeSingle, not single — a board that doesn't exist (or that RLS hides) resolves to null instead of throwing.
export async function getBoard(id: string): Promise<IBoard | null> {
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  return data;
}

// id minted client-side so the optimistic row and the server-confirmed row are the same row.
export async function createBoard({
  id = crypto.randomUUID(),
  title,
  spaceId = null,
}: {
  id?: string;
  title: string;
  spaceId?: string | null;
}): Promise<IBoard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("boards")
    .insert({ id, title, owner_id: user.id, space_id: spaceId })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function updateBoard({
  id,
  ...patch
}: { id: string } & BoardPatch): Promise<IBoard> {
  const { data, error } = await supabase
    .from("boards")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

// Cascades take the board's columns and todos with it — nothing rehomed first, unlike deleteColumn.
export async function deleteBoard(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("boards").delete().eq("id", id);

  if (error) throw error;

  return { id };
}

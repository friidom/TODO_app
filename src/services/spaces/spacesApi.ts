import { supabase } from "@/services/api/supabase";
import type { ISpace } from "@/types/data";

// A space is a folder, not a permission scope — filing a board into one grants nobody access to it.

export async function getSpaces(): Promise<ISpace[]> {
  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .order("title");

  if (error) throw error;

  return data;
}

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

// boards.space_id is on delete set null — deleting a space unfiles its boards rather than deleting them
export async function deleteSpace(id: string): Promise<{ id: string }> {
  const { error } = await supabase.from("spaces").delete().eq("id", id);

  if (error) throw error;

  return { id };
}

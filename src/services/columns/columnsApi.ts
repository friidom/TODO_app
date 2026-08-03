import { supabase } from "@/services/api/supabase";
import type { IColumn } from "@/types/data";

export async function getColumns(): Promise<IColumn[]> {
  const { data, error } = await supabase
    .from("columns")
    .select("*")
    .order("position");

  if (error) throw error;

  return data;
}


export async function createColumn(title: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data: lastColumn } = await supabase
    .from("columns")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (lastColumn?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("columns")
    .insert({
      title,
      user_id: user.id,
      position,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
//reorder columns
export async function reorderColumns(columns: IColumn[]) {
  const updates = columns.map((column) => ({
    id: column.id,
    position: column.position,
  }));

  const { error } = await supabase
    .from("columns")
    .upsert(updates, {
      onConflict: "id",
    });

  if (error) throw error;
}
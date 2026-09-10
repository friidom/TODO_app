import { supabase } from "@/services/api/supabase";
import type { Sprint } from "@/types/data";
import { rankForAppend } from "@/utils/rank";

// start/complete are RPCs, not a plain update — each is more than one write (bulk-assign a column / rehome unfinished work) and needs one transaction

export async function fetchSprints(boardId: string): Promise<Sprint[]> {
  const { data, error } = await supabase
    .from("sprints")
    .select("*")
    .eq("board_id", boardId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data;
}

export interface CreateSprintInput {
  board_id: string;
  name: string;
  goal?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export async function createSprint({
  board_id,
  name,
  goal = null,
  start_date = null,
  end_date = null,
}: CreateSprintInput): Promise<Sprint> {
  const { data: existing, error: fetchError } = await supabase
    .from("sprints")
    .select("rank")
    .eq("board_id", board_id);

  if (fetchError) throw fetchError;

  const rank = rankForAppend(
    (existing ?? []).map((row) => ({ rank: row.rank, position: null })),
  );

  const { data, error } = await supabase
    .from("sprints")
    .insert({ board_id, name, goal, start_date, end_date, rank })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export type SprintPatch = { id: string } & Partial<
  Pick<Sprint, "name" | "goal" | "start_date" | "end_date">
>;

// never touches state — see startSprint/completeSprint for that
export async function updateSprint({
  id,
  ...patch
}: SprintPatch): Promise<Sprint> {
  const { data, error } = await supabase
    .from("sprints")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

// todos.sprint_id is on delete set null, not cascade — deleting a sprint returns its work to the Backlog, doesn't delete it
export async function deleteSprint(sprintId: string): Promise<string> {
  const { error } = await supabase.from("sprints").delete().eq("id", sprintId);

  if (error) throw error;

  return sprintId;
}

export async function startSprint(sprintId: string): Promise<void> {
  const { error } = await supabase.rpc("start_sprint", {
    p_sprint_id: sprintId,
  });

  if (error) throw error;
}

// a finished item keeps its sprint_id — that's the record of what shipped
export async function completeSprint(
  sprintId: string,
  moveToSprintId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("complete_sprint", {
    p_sprint_id: sprintId,
    p_move_to_sprint_id: moveToSprintId ?? undefined,
  });

  if (error) throw error;
}

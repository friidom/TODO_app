import { supabase } from "@/services/api/supabase";
import type { Sprint } from "@/types/data";
import { rankForAppend } from "@/utils/rank";

/**
 * The raw Supabase calls for `sprints` (M30) — no hooks, no cache writes, the
 * same split every other feature folder keeps between `<feature>Api.ts` and
 * `use*.ts`.
 *
 * **State transitions are not a patch.** `start_sprint` and `complete_sprint`
 * are RPCs, not `update sprints set state = ...`, because both are more than
 * one write — starting bulk-assigns a column to whatever the sprint holds
 * that has none yet, and completing rehomes unfinished work. A function body
 * is one transaction; two sequential client writes are not, and a failure
 * between them would leave the sprint's state ahead of or behind the work it
 * describes. See the migration's own header for the full reasoning.
 */

/** Every sprint on one board, oldest first — the Backlog view re-sorts by
 * `rank` and filters by `state` itself (`buildBacklogBoard`), so this is the
 * unfiltered set every reader (the Backlog page, Sprint Details, the Task
 * Detail Sprint field) shares. */
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

/**
 * A new sprint, appended after the board's existing ones.
 *
 * Reuses `rankForAppend` unchanged — the migration's own decision is that
 * this is the same fractional scheme `rank.ts` already implements, not a
 * second one. `sprints` has no `position` column to fall back to, so each
 * row is adapted to the shape `rankForAppend` expects with `position: null`,
 * which `rankOf` reads as `0` and never uses: every existing sprint already
 * has a real `rank` from its own creation.
 */
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

/** Edits a sprint's own fields. Never its `state` — see the module doc. */
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

/** Moves a future sprint to active and bulk-assigns the board's first
 * `todo`-category column to every item of its that has none yet. */
export async function startSprint(sprintId: string): Promise<void> {
  const { error } = await supabase.rpc("start_sprint", {
    p_sprint_id: sprintId,
  });

  if (error) throw error;
}

/**
 * Moves an active sprint to completed.
 *
 * `moveToSprintId` is the destination for its unfinished work — another
 * sprint's id, or `null` for the Backlog. A finished item (sitting in a
 * done-category column) is untouched, keeping its `sprint_id` as the record
 * of what shipped in this sprint.
 */
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

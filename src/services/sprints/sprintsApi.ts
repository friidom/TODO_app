import { api } from "@/services/api/client";
import type { Sprint } from "@/types/data";

// start/complete are their own endpoints, not a patch — each is more than one write (bulk-assign a column / rehome unfinished work) and needs one transaction

export function fetchSprints(boardId: string): Promise<Sprint[]> {
  return api.get<Sprint[]>(`/boards/${boardId}/sprints`);
}

export interface CreateSprintInput {
  board_id: string;
  name: string;
  goal?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export function createSprint({
  board_id,
  name,
  goal = null,
  start_date = null,
  end_date = null,
}: CreateSprintInput): Promise<Sprint> {
  return api.post<Sprint>(`/boards/${board_id}/sprints`, {
    name,
    goal,
    start_date,
    end_date,
  });
}

export type SprintPatch = { id: string } & Partial<
  Pick<Sprint, "name" | "goal" | "start_date" | "end_date">
>;

// never touches state — see startSprint/completeSprint for that
export function updateSprint({ id, ...patch }: SprintPatch): Promise<Sprint> {
  return api.patch<Sprint>(`/sprints/${id}`, patch);
}

// todos.sprint_id is on delete set null, not cascade — deleting a sprint returns its work to the Backlog, doesn't delete it
export async function deleteSprint(sprintId: string): Promise<string> {
  await api.del<void>(`/sprints/${sprintId}`);

  return sprintId;
}

export async function startSprint(sprintId: string): Promise<void> {
  await api.post<Sprint>(`/sprints/${sprintId}/start`);
}

// a finished item keeps its sprint_id — that's the record of what shipped
export async function completeSprint(
  sprintId: string,
  moveToSprintId: string | null,
): Promise<void> {
  await api.post<Sprint>(`/sprints/${sprintId}/complete`, { moveToSprintId });
}

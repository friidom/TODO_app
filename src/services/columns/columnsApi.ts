import { api } from "@/services/api/client";
import type { IColumn } from "@/types/data";

// Limits only. A column's title, order and existence are the workflow's and
// change through services/workflow/usePublishWorkflow.
export function updateColumn({
  id,
  ...patch
}: Pick<IColumn, "id"> & Partial<Pick<IColumn, "min_limit" | "max_limit">>): Promise<IColumn> {
  return api.patch<IColumn>(`/columns/${id}`, patch);
}

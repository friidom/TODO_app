import { api } from "@/services/api/client";
import type { IWorkflow } from "@/types/data";

import type { WorkflowDraft } from "./draft";

export function getWorkflow(boardId: string): Promise<IWorkflow> {
  return api.get<IWorkflow>(`/boards/${boardId}/workflow`);
}

// Answers the new snapshot, so the publisher's cache is replaced by exactly
// what committed rather than by a refetch that might race another publish.
export function publishWorkflow(
  boardId: string,
  draft: WorkflowDraft,
): Promise<IWorkflow> {
  return api.put<IWorkflow>(`/boards/${boardId}/workflow`, draft);
}

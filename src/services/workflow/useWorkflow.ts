import { useQuery } from "@tanstack/react-query";

import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { IWorkflow } from "@/types/data";

import { toWorkflowModel } from "./statuses";
import { getWorkflow } from "./workflowApi";

export function workflowQuery(boardId: string | undefined) {
  return {
    queryKey: queryKeys.workflow(boardId),
    // `enabled` already stops this running without a board; the guard is what
    // proves it to the compiler, rather than asserting non-null.
    queryFn: () => {
      if (!boardId) throw new Error("the workflow was read without a board");

      return getWorkflow(boardId);
    },
    enabled: Boolean(boardId),
  };
}

// Module-level, so the select runs once per snapshot rather than once per render.
function selectStatuses(workflow: IWorkflow) {
  return toWorkflowModel(workflow).statuses;
}

// The board's workflow as one model: columns and statuses in board order, and
// the index every "which column is this card in" question is answered from.
export function useWorkflow() {
  const boardId = useBoardId();

  return useQuery({ ...workflowQuery(boardId), select: toWorkflowModel });
}

export function useStatuses() {
  const boardId = useBoardId();

  return useQuery({ ...workflowQuery(boardId), select: selectStatuses });
}

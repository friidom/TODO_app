import { useQuery } from "@tanstack/react-query";

import { useBoardId } from "@/hooks/useBoardId";
import { workflowQuery } from "@/services/workflow/useWorkflow";
import type { IWorkflow } from "@/types/data";

// Module-level, so the select runs once per snapshot rather than once per render.
function selectColumns(workflow: IWorkflow) {
  return workflow.columns;
}

// The columns half of the workflow snapshot — the same cache entry the
// statuses live in, so the two can never describe different versions.
export function useColumns() {
  const boardId = useBoardId();

  return useQuery({ ...workflowQuery(boardId), select: selectColumns });
}

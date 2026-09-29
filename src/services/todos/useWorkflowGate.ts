import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useBoardId } from "@/hooks/useBoardId";
import { useBoard } from "@/services/boards/useBoard";
import { EMPTY_WORKFLOW, hasTransition } from "@/services/workflow/statuses";
import { useWorkflow } from "@/services/workflow/useWorkflow";

// The UI's reading of the workflow: the board's stored transitions plus the
// board's own switch (boards.workflow_enabled, migration 0020).
//
// This decides what to OFFER. todos.service.ts decides what is ALLOWED, from the
// same edges and the same flag, so a stale snapshot here can only mean a control
// that fails with a toast — never a move that should have been refused and was
// not.
//
// Defaults to enforcing while the board query is in flight: offering a move and
// withdrawing it reads worse than the reverse, and the API refuses either way.
export function useWorkflowGate() {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);
  const { data: workflow = EMPTY_WORKFLOW } = useWorkflow();
  const { t } = useTranslation();

  const enforced = board?.workflow_enabled ?? true;

  // A card with no status yet is being placed, not moved, and staying in the
  // same status is a reorder; neither is a transition.
  const allows = useCallback(
    (fromId: string | null | undefined, toId: string) =>
      !enforced ||
      fromId == null ||
      fromId === toId ||
      hasTransition(workflow.transitions, fromId, toId),
    [enforced, workflow.transitions],
  );

  const refusal = useCallback(
    (fromId: string | null | undefined, toId: string) => {
      if (allows(fromId, toId)) return null;

      return t("workflow.noTransition", {
        from: workflow.statusById.get(fromId ?? "")?.name ?? "",
        to: workflow.statusById.get(toId)?.name ?? "",
      });
    },
    [allows, workflow.statusById, t],
  );

  return { enforced, allows, refusal };
}

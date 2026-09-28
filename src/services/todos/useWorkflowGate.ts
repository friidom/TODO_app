import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useBoardId } from "@/hooks/useBoardId";
import { useBoard } from "@/services/boards/useBoard";
import { useStatuses } from "@/services/workflow/useWorkflow";
import { visibleCategories } from "@/services/workflow/statuses";
import { categoryLabelKey, type ColumnCategory } from "@/constants/columns";
import type { IStatus } from "@/types/data";
import { canTransition, stagesBetween } from "./workflow";

const NO_STATUSES: IStatus[] = [];

// The UI's reading of the workflow: the mirrored rule in workflow.ts plus the
// board's own switch (boards.workflow_enabled, migration 0020).
//
// This decides what to OFFER. todos.service.ts decides what is ALLOWED, and it
// re-reads the same flag from the database, so a stale board query here can
// only mean a control that fails with a toast — never a move that should have
// been refused and was not.
//
// Defaults to enforcing while the board query is in flight: offering a move and
// withdrawing it reads worse than the reverse, and the API refuses either way.
export function useWorkflowGate() {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);
  const { data: statuses = NO_STATUSES } = useStatuses();
  const { t } = useTranslation();

  const enforced = board?.workflow_enabled ?? true;

  // Only stages this board can receive work in are ones a card can be asked to
  // pass through — the same rule todos.service applies, so the two agree about
  // a board with no visible status in some stage.
  const present = useMemo(() => visibleCategories(statuses), [statuses]);

  const skipped = useCallback(
    (from: string | null | undefined, to: string | null | undefined) =>
      stagesBetween(from, to).filter((stage) =>
        present.has(stage as ColumnCategory),
      ),
    [present],
  );

  const allows = useCallback(
    (from: string | null | undefined, to: string | null | undefined) =>
      !enforced || canTransition(from, to) || skipped(from, to).length === 0,
    [enforced, skipped],
  );

  // The stages a refused move would skip, already translated, so a tooltip or a
  // toast can say what is missing rather than only that something is.
  const refusal = useCallback(
    (from: string | null | undefined, to: string | null | undefined) => {
      if (allows(from, to)) return null;

      const names = skipped(from, to)
        .map((stage) => t(categoryLabelKey(stage as ColumnCategory)))
        .join(", ");

      return t("workflow.passThroughFirst", { stages: names });
    },
    [allows, skipped, t],
  );

  return { enforced, allows, refusal };
}

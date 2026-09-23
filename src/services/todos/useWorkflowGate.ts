import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useBoardId } from "@/hooks/useBoardId";
import { useBoard } from "@/services/boards/useBoard";
import { useColumns } from "@/services/columns/useColumnsApi";
import { categoryLabelKey, type ColumnCategory } from "@/constants/columns";
import { canTransition, stagesBetween } from "./workflow";

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
  const { data: columns = [] } = useColumns();
  const { t } = useTranslation();

  const enforced = board?.workflow_enabled ?? true;

  // Only stages this board has are ones a card can be asked to pass through —
  // the same rule todos.service applies, so the two agree about a board whose
  // columns skip a stage.
  const present = useMemo(
    () => new Set(columns.map((column) => column.category)),
    [columns],
  );

  const skipped = useCallback(
    (from: string | null | undefined, to: string | null | undefined) =>
      stagesBetween(from, to).filter((stage) => present.has(stage)),
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

      return `Move it to ${names} first.`;
    },
    [allows, skipped, t],
  );

  return { enforced, allows, refusal };
}

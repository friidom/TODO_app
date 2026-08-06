import { useState } from "react";

import type { IColumn } from "@/types/data";

/**
 * Which column each of the board's three modals is acting on.
 *
 * Kept together because they share one rule: a modal is open exactly when it
 * has a target, and closing it clears that target. Holding the column rather
 * than an id is what stops a stale target from outliving its modal — there is
 * no separate open flag to fall out of step with it.
 *
 * `CreateColumnModal` is the exception and needs a boolean, because creating a
 * column has no column to point at yet.
 */
export function useBoardModals() {
  const [createColumnOpen, setCreateColumnOpen] = useState(false);
  const [limitColumn, setLimitColumn] = useState<IColumn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IColumn | null>(null);

  return {
    createColumnOpen,
    /** `AddColumnButton` takes a setter, so it is handed one. */
    setCreateColumnOpen,
    closeCreateColumn: () => setCreateColumnOpen(false),

    /** The column whose work-item limits are being edited. */
    limitColumn,
    openLimitModal: (column: IColumn) => setLimitColumn(column),
    closeLimitModal: () => setLimitColumn(null),

    /** The column queued for deletion; its todos are rehomed first. */
    deleteTarget,
    openDeleteModal: (column: IColumn) => setDeleteTarget(column),
    closeDeleteModal: () => setDeleteTarget(null),
  };
}

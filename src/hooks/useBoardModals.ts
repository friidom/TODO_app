import { useState } from "react";

import type { IColumn } from "@/types/data";

// holds the column, not an id — a modal is open exactly when it has a target, no separate open flag to fall out of step
export function useBoardModals() {
  const [createColumnOpen, setCreateColumnOpen] = useState(false);
  const [limitColumn, setLimitColumn] = useState<IColumn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IColumn | null>(null);

  return {
    createColumnOpen,
    setCreateColumnOpen,
    closeCreateColumn: () => setCreateColumnOpen(false),

    limitColumn,
    openLimitModal: (column: IColumn) => setLimitColumn(column),
    closeLimitModal: () => setLimitColumn(null),

    deleteTarget,
    openDeleteModal: (column: IColumn) => setDeleteTarget(column),
    closeDeleteModal: () => setDeleteTarget(null),
  };
}

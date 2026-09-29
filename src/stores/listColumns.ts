import { create } from "zustand";

import {
  DEFAULT_LIST_COLUMNS,
  moveListColumn,
  readListColumnWidths,
  readListColumns,
  toggleListColumn,
  withListColumnWidth,
  writeListColumnWidths,
  writeListColumns,
  type ListColumnId,
  type ListColumnWidths,
} from "@/services/views/listColumns";
import type { Side } from "@/utils/reorder";

interface ListColumnsStore {
  columns: ListColumnId[];
  widths: ListColumnWidths;
  toggle: (id: ListColumnId) => void;
  move: (activeId: ListColumnId, overId: ListColumnId, side: Side) => void;
  /** Live, while a resize handle is being dragged — not remembered until setWidth. */
  previewWidth: (id: ListColumnId, width: number) => void;
  setWidth: (id: ListColumnId, width: number) => void;
  resetWidth: (id: ListColumnId) => void;
  reset: () => void;
}

// A store rather than component state because the two readers are siblings: the
// Columns menu renders in the board toolbar and the table renders in ViewShell's
// children, and the nearest common parent is BoardPage, which has no business
// knowing about the List's columns.
//
// Seeded from localStorage once at module load, so the menu and the table start
// from the same array without an effect to synchronise them.
export const useListColumns = create<ListColumnsStore>((set, get) => ({
  columns: readListColumns(),
  widths: readListColumnWidths(),

  toggle: (id) =>
    set((state) => {
      const columns = toggleListColumn(state.columns, id);

      writeListColumns(columns);

      return { columns };
    }),

  move: (activeId, overId, side) =>
    set((state) => {
      const columns = moveListColumn(state.columns, activeId, overId, side);

      writeListColumns(columns);

      return { columns };
    }),

  previewWidth: (id, width) =>
    set((state) => ({ widths: withListColumnWidth(state.widths, id, width) })),

  setWidth: (id, width) => {
    get().previewWidth(id, width);
    writeListColumnWidths(get().widths);
  },

  resetWidth: (id) =>
    set((state) => {
      const widths = withListColumnWidth(state.widths, id, null);

      writeListColumnWidths(widths);

      return { widths };
    }),

  reset: () => {
    const columns = [...DEFAULT_LIST_COLUMNS];

    writeListColumns(columns);
    writeListColumnWidths({});

    set({ columns, widths: {} });
  },
}));

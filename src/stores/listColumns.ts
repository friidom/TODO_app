import { create } from "zustand";

import {
  DEFAULT_LIST_COLUMNS,
  swapListColumns,
  readListColumns,
  toggleListColumn,
  writeListColumns,
  type ListColumnId,
} from "@/services/views/listColumns";

interface ListColumnsStore {
  columns: ListColumnId[];
  toggle: (id: ListColumnId) => void;
  /** Trades two columns' slots. The caller names the visible neighbour — see swapListColumns. */
  swap: (a: ListColumnId, b: ListColumnId) => void;
  reset: () => void;
}

// A store rather than component state because the two readers are siblings: the
// Columns menu renders in the board toolbar and the table renders in ViewShell's
// children, and the nearest common parent is BoardPage, which has no business
// knowing about the List's columns.
//
// Seeded from localStorage once at module load, so the menu and the table start
// from the same array without an effect to synchronise them.
export const useListColumns = create<ListColumnsStore>((set) => ({
  columns: readListColumns(),

  toggle: (id) =>
    set((state) => {
      const columns = toggleListColumn(state.columns, id);

      writeListColumns(columns);

      return { columns };
    }),

  swap: (a, b) =>
    set((state) => {
      const columns = swapListColumns(state.columns, a, b);

      writeListColumns(columns);

      return { columns };
    }),

  reset: () => {
    const columns = [...DEFAULT_LIST_COLUMNS];

    writeListColumns(columns);

    set({ columns });
  },
}));

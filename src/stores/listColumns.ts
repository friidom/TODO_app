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
  // Keyed by board; a board appears here once its widths have been changed.
  widths: Record<string, ListColumnWidths>;
  toggle: (id: ListColumnId) => void;
  move: (activeId: ListColumnId, overId: ListColumnId, side: Side) => void;
  setWidth: (boardId: string, id: ListColumnId, width: number) => void;
  resetWidth: (boardId: string, id: ListColumnId) => void;
  reset: (boardId: string) => void;
}

// Read once per board, so every render of an untouched board gets the same
// object back and the rows' memo holds.
const fromStorage = new Map<string, ListColumnWidths>();

function storedWidths(boardId: string): ListColumnWidths {
  let widths = fromStorage.get(boardId);

  if (!widths) {
    widths = readListColumnWidths(boardId);
    fromStorage.set(boardId, widths);
  }

  return widths;
}

// A store rather than component state because the two readers are siblings: the
// Columns menu renders in the board toolbar and the table renders in ViewShell's
// children, and the nearest common parent is BoardPage, which has no business
// knowing about the List's columns.
//
// The column set is seeded from localStorage once at module load, so the menu
// and the table start from the same array without an effect to synchronise
// them; widths are read the first time each board asks for them.
export const useListColumns = create<ListColumnsStore>((set, get) => {
  function writeWidth(boardId: string, id: ListColumnId, width: number | null) {
    const current = get().widths[boardId] ?? storedWidths(boardId);
    const next = withListColumnWidth(current, id, width);

    writeListColumnWidths(next, boardId);
    set((state) => ({ widths: { ...state.widths, [boardId]: next } }));
  }

  return {
    columns: readListColumns(),
    widths: {},

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

    setWidth: (boardId, id, width) => writeWidth(boardId, id, width),

    resetWidth: (boardId, id) => writeWidth(boardId, id, null),

    reset: (boardId) => {
      const columns = [...DEFAULT_LIST_COLUMNS];

      writeListColumns(columns);
      writeListColumnWidths({}, boardId);

      set((state) => ({ columns, widths: { ...state.widths, [boardId]: {} } }));
    },
  };
});

export function useListColumnWidths(
  boardId: string | undefined,
): ListColumnWidths {
  const key = boardId ?? "";
  const changed = useListColumns((state) => state.widths[key]);

  return changed ?? storedWidths(key);
}

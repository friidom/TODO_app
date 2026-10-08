import { create } from "zustand";

import {
  DEFAULT_SUBTASK_COLUMNS,
  normalizeSubtaskTable,
  readSubtaskTable,
  toggleSubtaskColumn,
  writeSubtaskTable,
  type SubtaskColumnId,
  type SubtaskSort,
  type SubtaskTablePrefs,
} from "@/services/todos/subtaskTable";

interface SubtaskTableStore {
  prefs: SubtaskTablePrefs;
  toggleColumn: (id: SubtaskColumnId) => void;
  setHideDone: (hideDone: boolean) => void;
  setSort: (sort: SubtaskSort) => void;
  resetColumns: () => void;
}

// A store because the header menus and the table are siblings inside the section, and every task's table shares one choice.
export const useSubtaskTable = create<SubtaskTableStore>((set) => {
  function apply(change: (current: SubtaskTablePrefs) => SubtaskTablePrefs) {
    set((state) => {
      const prefs = normalizeSubtaskTable(change(state.prefs));

      writeSubtaskTable(prefs);

      return { prefs };
    });
  }

  return {
    prefs: readSubtaskTable(),

    toggleColumn: (id) =>
      apply((current) => ({
        ...current,
        columns: toggleSubtaskColumn(current.columns, id),
      })),

    setHideDone: (hideDone) => apply((current) => ({ ...current, hideDone })),

    setSort: (sort) => apply((current) => ({ ...current, sort })),

    resetColumns: () =>
      apply((current) => ({
        ...current,
        columns: [...DEFAULT_SUBTASK_COLUMNS],
      })),
  };
});

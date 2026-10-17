import { create } from "zustand";

import {
  normalizeBoardViewPrefs,
  readDeviceViewPrefs,
  readPersonalViewPrefs,
  sameBoardViewPrefs,
  writePersonalViewPrefs,
  type BoardViewPrefs,
} from "@/services/views/boardViewPrefs";

interface BoardViewPrefsStore {
  device: BoardViewPrefs | null;
  personal: Record<string, BoardViewPrefs>;
  // A change equal to what Reset would return to is no change, and is dropped rather than kept.
  setPersonal: (
    boardId: string,
    prefs: BoardViewPrefs | null,
    baseline: BoardViewPrefs,
  ) => void;
}

// A store because the settings drawer writes it and the board, several components away, reads it.
export const useBoardViewPrefsStore = create<BoardViewPrefsStore>((set) => ({
  device: readDeviceViewPrefs(),
  personal: readPersonalViewPrefs(),

  setPersonal: (boardId, prefs, baseline) =>
    set((state) => {
      const next = { ...state.personal };
      const normalized = prefs && normalizeBoardViewPrefs(prefs);

      if (normalized === null || sameBoardViewPrefs(normalized, baseline)) {
        delete next[boardId];
      } else {
        next[boardId] = normalized;
      }

      writePersonalViewPrefs(next);

      return { personal: next };
    }),
}));

import { create } from "zustand";

import {
  normalizeBoardViewPrefs,
  readBoardViewPrefs,
  writeBoardViewPrefs,
  type BoardViewPrefs,
} from "@/services/views/boardViewPrefs";

interface BoardViewPrefsStore {
  prefs: BoardViewPrefs;
  setPrefs: (patch: Partial<BoardViewPrefs>) => void;
}

// A store because the settings drawer writes it and the board, several components away, reads it.
export const useBoardViewPrefs = create<BoardViewPrefsStore>((set) => ({
  prefs: readBoardViewPrefs(),

  setPrefs: (patch) =>
    set((state) => {
      const prefs = normalizeBoardViewPrefs({ ...state.prefs, ...patch });

      writeBoardViewPrefs(prefs);

      return { prefs };
    }),
}));

import { create } from "zustand";

import type { ViewMode } from "@/services/views/registry";
import {
  readDefaultViews,
  withDefaultView,
  writeDefaultViews,
  type DefaultViews,
} from "@/services/views/tabs";

interface DefaultViewStore {
  views: DefaultViews;
  setDefault: (boardId: string, mode: ViewMode) => void;
}

// A store rather than a hook's state because every useBoardView caller, from
// BoardPage down to each view, has to agree on what a bare URL shows.
export const useDefaultViews = create<DefaultViewStore>((set) => ({
  views: readDefaultViews(),

  setDefault: (boardId, mode) =>
    set((state) => {
      const views = withDefaultView(state.views, boardId, mode);

      writeDefaultViews(views);

      return { views };
    }),
}));

import { create } from "zustand";

import {
  readToolbarControls,
  writeToolbarControls,
  type ToolbarControlId,
} from "@/services/views/toolbar";
import { reorder, type Side } from "@/utils/reorder";

interface ToolbarControlsStore {
  order: ToolbarControlId[];
  move: (
    activeId: ToolbarControlId,
    overId: ToolbarControlId,
    side: Side,
  ) => void;
}

export const useToolbarControls = create<ToolbarControlsStore>((set) => ({
  order: readToolbarControls(),

  move: (activeId, overId, side) =>
    set((state) => {
      const order = reorder(state.order, activeId, overId, side);

      writeToolbarControls(order);

      return { order };
    }),
}));

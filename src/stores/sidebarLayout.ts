import { create } from "zustand";

import {
  readSidebarLayout,
  writeSidebarLayout,
  type SidebarLayout,
} from "@/services/sidebar/layout";

interface SidebarLayoutStore {
  layout: SidebarLayout;
  update: (change: (layout: SidebarLayout) => SidebarLayout) => void;
}

export const useSidebarLayout = create<SidebarLayoutStore>((set) => ({
  layout: readSidebarLayout(),

  update: (change) =>
    set((state) => {
      const layout = change(state.layout);

      writeSidebarLayout(layout);

      return { layout };
    }),
}));

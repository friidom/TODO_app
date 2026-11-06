import { useCallback, useMemo } from "react";
import { create } from "zustand";

import { useAuth } from "@/services/auth/useAuth";
import {
  readSidebarLayout,
  writeSidebarLayout,
  type SidebarLayout,
} from "@/services/sidebar/layout";

type Change = (layout: SidebarLayout) => SidebarLayout;

// By user, so signing in as someone else in this tab reads their layout.
const useLayouts = create<{
  byUser: Record<string, SidebarLayout>;
  update: (userId: string, change: Change) => void;
}>((set) => ({
  byUser: {},

  update: (userId, change) =>
    set((state) => {
      const layout = change(state.byUser[userId] ?? readSidebarLayout(userId));

      writeSidebarLayout(userId, layout);

      return { byUser: { ...state.byUser, [userId]: layout } };
    }),
}));

export function useSidebarLayout() {
  const userId = useAuth().user?.id ?? "";
  const cached = useLayouts((state) => state.byUser[userId]);
  const apply = useLayouts((state) => state.update);

  const layout = useMemo(
    () => cached ?? readSidebarLayout(userId),
    [cached, userId],
  );

  const update = useCallback(
    (change: Change) => apply(userId, change),
    [apply, userId],
  );

  return { layout, update };
}

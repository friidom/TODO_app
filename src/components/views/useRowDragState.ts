import { useContext, useSyncExternalStore } from "react";

import { ReorderStoreContext } from "@/components/dnd/reorderDnd";
import type { Side } from "@/utils/reorder";

const NO_SUBSCRIPTION = () => () => {};

// What useReorderItem reports, read from the store directly. A row cannot call
// useReorderItem itself: dnd-kit re-renders every draggable whenever the drop
// target changes, which would defeat ListRow's memo on every step of a drag.
// This way only the rows whose answer changed re-render.
export function useRowDragState(id: string): {
  edge: Side | null;
  dragging: boolean;
} {
  const store = useContext(ReorderStoreContext);
  const subscribe = store?.subscribe ?? NO_SUBSCRIPTION;

  const edge = useSyncExternalStore(subscribe, () => {
    const snapshot = store?.get();

    return snapshot?.overId === id ? snapshot.side : null;
  });

  const dragging = useSyncExternalStore(
    subscribe,
    () => store?.get().activeId === id,
  );

  return { edge, dragging };
}

import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  useSensor,
  useSensors,
  type Collision,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { Side } from "@/utils/reorder";
import {
  ReorderPointerSensor,
  ReorderStoreContext,
  createReorderStore,
  reorderCollision,
  reorderKeyboardCoordinates,
  type ReorderData,
  type ReorderMove,
} from "./reorderDnd";

function targetOf(collisions: Collision[] | null) {
  const first = collisions?.[0];

  if (!first) return null;

  return {
    overId: String(first.id),
    side: (first.data?.side as Side | null | undefined) ?? null,
  };
}

export default function ReorderContext({
  children,
  onReorder,
  renderOverlay,
  describe = String,
}: {
  children: ReactNode;
  onReorder: (move: ReorderMove) => void;
  renderOverlay: (activeId: string) => ReactNode;
  // What a screen reader hears for an id, which is otherwise a uuid.
  describe?: (id: string) => string;
}) {
  const [store] = useState(createReorderStore);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // 6px of travel before a drag starts, so a click on a tab or a toolbar
    // button stays a click.
    useSensor(ReorderPointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: reorderKeyboardCoordinates }),
  );

  const { t } = useTranslation();
  const name = (id: UniqueIdentifier) => describe(String(id));

  function reset() {
    setActiveId(null);
    store.reset();
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={reorderCollision}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) =>
            t("dnd.pickedUp", { label: name(active.id) }),
          onDragOver: ({ active, over }) =>
            over
              ? t("dnd.nextTo", {
                  label: name(active.id),
                  other: name(over.id),
                })
              : t("dnd.backWhereStarted", { label: name(active.id) }),
          onDragEnd: ({ active, over }) =>
            over
              ? t("dnd.movedNextTo", {
                  label: name(active.id),
                  other: name(over.id),
                })
              : t("dnd.notMoved", { label: name(active.id) }),
          onDragCancel: ({ active }) =>
            t("dnd.cancelledMoving", { label: name(active.id) }),
        },
      }}
      onDragStart={({ active }) => {
        setActiveId(String(active.id));
        store.set({ activeId: String(active.id), overId: null, side: null });
      }}
      onDragMove={({ active, collisions }) => {
        const target = targetOf(collisions);

        store.set({
          activeId: String(active.id),
          overId: target?.overId ?? null,
          side: target?.side ?? null,
        });
      }}
      onDragEnd={({ active, collisions }) => {
        const target = targetOf(collisions);
        const data = active.data.current as ReorderData | undefined;

        reset();

        if (target && data) {
          onReorder({ activeId: String(active.id), ...target, data });
        }
      }}
      onDragCancel={reset}
    >
      <ReorderStoreContext.Provider value={store}>
        {children}
      </ReorderStoreContext.Provider>

      {/* Portalled: a popover or panel positioned with a transform would
          otherwise become the overlay's containing block and offset it. */}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {activeId ? renderOverlay(activeId) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

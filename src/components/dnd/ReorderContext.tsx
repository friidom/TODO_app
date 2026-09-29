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
          onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${name(active.id)} is next to ${name(over.id)}.`
              : `${name(active.id)} is back where it started.`,
          onDragEnd: ({ active, over }) =>
            over
              ? `Moved ${name(active.id)} next to ${name(over.id)}.`
              : `${name(active.id)} was not moved.`,
          onDragCancel: ({ active }) => `Cancelled moving ${name(active.id)}.`,
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

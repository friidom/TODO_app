import {
  PointerSensor,
  useDraggable,
  useDroppable,
  type ClientRect,
  type Collision,
  type CollisionDetection,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
  type PointerSensorOptions,
} from "@dnd-kit/core";
import type {
  PointerEventHandler,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import { stepGap, type Side } from "@/utils/reorder";

// The one drag-to-reorder mechanism behind tabs, toolbar controls, List
// columns and rows, and workflow statuses. Like the board, nothing reflows
// while dragging: items stay put, a DragOverlay follows the pointer and a line
// marks where the drop would land.

export type Axis = "x" | "y";

export interface ReorderData {
  group: string;
  axis: Axis;
  kind: "item" | "container";
  container?: string;
}

// side null: dropped on an empty container, whose id is overId.
export interface ReorderMove {
  activeId: string;
  overId: string;
  side: Side | null;
  data: ReorderData;
}

interface Snapshot {
  activeId: string | null;
  overId: string | null;
  side: Side | null;
}

const IDLE: Snapshot = { activeId: null, overId: null, side: null };

// An external store rather than context state, so a pointer crossing a
// hundred List rows re-renders the two rows whose indicator changed, not all.
export function createReorderStore() {
  let snapshot = IDLE;
  const listeners = new Set<() => void>();

  return {
    get: () => snapshot,
    set(next: Snapshot) {
      if (
        next.activeId === snapshot.activeId &&
        next.overId === snapshot.overId &&
        next.side === snapshot.side
      ) {
        return;
      }

      snapshot = next;
      listeners.forEach((listener) => listener());
    },
    reset() {
      this.set(IDLE);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type ReorderStore = ReturnType<typeof createReorderStore>;

export const ReorderStoreContext = createContext<ReorderStore | null>(null);

function useReorderStore(): ReorderStore {
  const store = useContext(ReorderStoreContext);

  if (!store)
    throw new Error("useReorderItem must be used inside ReorderContext");

  return store;
}

const NO_DRAG =
  'input, textarea, select, [contenteditable="true"], [data-no-drag]';

// A drag must never start from a text field (selecting text would become a
// drag) or from a control marked data-no-drag, such as a resize handle.
export class ReorderPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        { nativeEvent: event }: ReactPointerEvent,
        { onActivation }: PointerSensorOptions,
      ) => {
        if (!event.isPrimary || event.button !== 0) return false;

        if (event.target instanceof Element && event.target.closest(NO_DRAG)) {
          return false;
        }

        onActivation?.({ event });

        return true;
      },
    },
  ];
}

// A control collapsed with display:none still registers, measured as a
// zero rect at the viewport origin, where it would win every drop near 0,0.
function isShown(rect: ClientRect | null): rect is ClientRect {
  return !!rect && (rect.width > 0 || rect.height > 0);
}

function dataOf(container: { data: { current?: unknown } }) {
  return container.data.current as ReorderData | undefined;
}

function along(rect: ClientRect, axis: Axis): number {
  return axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
}

function distanceToRect(rect: ClientRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);

  return Math.hypot(dx, dy);
}

function nearest(
  containers: DroppableContainer[],
  distance: (rect: ClientRect) => number,
): DroppableContainer | null {
  let best: DroppableContainer | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const container of containers) {
    const rect = container.rect.current;

    if (!rect) continue;

    const value = distance(rect);

    if (value < bestDistance) {
      bestDistance = value;
      best = container;
    }
  }

  return best;
}

// Items of one list, in the order they sit on screen.
function itemsOf(
  containers: DroppableContainer[],
  data: ReorderData,
  container: string | undefined,
): DroppableContainer[] {
  return containers
    .filter((it) => {
      const other = dataOf(it);

      return (
        isShown(it.rect.current) &&
        other?.group === data.group &&
        other.kind === "item" &&
        other.container === container
      );
    })
    .sort(
      (a, b) =>
        along(a.rect.current!, data.axis) - along(b.rect.current!, data.axis),
    );
}

function hit(container: DroppableContainer, side: Side | null): Collision[] {
  return [{ id: container.id, data: { droppableContainer: container, side } }];
}

// Picks the gap nearest the pointer. With container droppables in the group
// (workflow columns), the nearest container is chosen first and the drop may
// cross into it; without, a list is confined to the dragged item's own
// container, which is how List rows stay inside their board column.
export const reorderCollision: CollisionDetection = ({
  active,
  collisionRect,
  droppableContainers,
  pointerCoordinates,
}) => {
  const data = dataOf(active);

  if (!data) return [];

  const point = pointerCoordinates ?? {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };

  const containers = droppableContainers.filter((it) => {
    const other = dataOf(it);

    return (
      isShown(it.rect.current) &&
      other?.group === data.group &&
      other.kind === "container"
    );
  });

  let container = data.container;
  let target: DroppableContainer | null = null;

  if (containers.length) {
    target = nearest(containers, (rect) =>
      distanceToRect(rect, point.x, point.y),
    );

    if (!target) return [];

    container = String(target.id);
  }

  const items = itemsOf(droppableContainers, data, container);
  const activeAt = items.findIndex((it) => it.id === active.id);

  if (items.length === (activeAt === -1 ? 0 : 1)) {
    return target && activeAt === -1 ? hit(target, null) : [];
  }

  const over = nearest(items, (rect) =>
    Math.abs(along(rect, data.axis) - point[data.axis]),
  );

  if (!over) return [];

  const at = items.indexOf(over);
  const gap =
    point[data.axis] < along(over.rect.current!, data.axis) ? at : at + 1;

  if (activeAt !== -1 && (gap === activeAt || gap === activeAt + 1)) return [];

  // "after A" and "before B" are one gap; naming it one way keeps the line
  // from jumping between A's edge and B's as the pointer crosses the gap.
  return gap < items.length
    ? hit(items[gap]!, "before")
    : hit(items[items.length - 1]!, "after");
};

// Arrow keys along the list's axis step one gap at a time. dnd-kit sensors
// speak coordinates, so this places the dragged item just short of the chosen
// gap's neighbour and reorderCollision resolves it back to that gap.
export const reorderKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context },
) => {
  const { active, collisionRect, droppableContainers } = context;
  const data = active && dataOf(active);

  if (!data || !collisionRect) return;

  const forward = data.axis === "x" ? "ArrowRight" : "ArrowDown";
  const backward = data.axis === "x" ? "ArrowLeft" : "ArrowUp";

  if (event.code !== forward && event.code !== backward) return;

  event.preventDefault();

  const items = itemsOf(droppableContainers.getEnabled(), data, data.container);
  const activeAt = items.findIndex((it) => it.id === active.id);

  if (activeAt === -1) return;

  const point =
    data.axis === "x"
      ? collisionRect.left + collisionRect.width / 2
      : collisionRect.top + collisionRect.height / 2;

  const closest = nearest(items, (rect) =>
    Math.abs(along(rect, data.axis) - point),
  )!;
  const closestAt = items.indexOf(closest);
  const from =
    point < along(closest.rect.current!, data.axis) ? closestAt : closestAt + 1;

  const gap = stepGap(
    items.length,
    activeAt,
    from,
    event.code === forward ? 1 : -1,
  );

  if (gap === null) return;

  const target =
    gap < items.length
      ? along(items[gap]!.rect.current!, data.axis) - 1
      : along(items[items.length - 1]!.rect.current!, data.axis) + 1;

  const delta = target - point;

  return data.axis === "x"
    ? { x: currentCoordinates.x + delta, y: currentCoordinates.y }
    : { x: currentCoordinates.x, y: currentCoordinates.y + delta };
};

export interface ReorderItemOptions {
  group: string;
  axis: Axis;
  container?: string;
  // Neither draggable nor a drop target — a locked item keeps its slot.
  disabled?: boolean;
}

export function useReorderItem(
  id: string,
  { group, axis, container, disabled = false }: ReorderItemOptions,
) {
  const store = useReorderStore();

  const data = useMemo<ReorderData>(
    () => ({ group, axis, kind: "item", container }),
    [group, axis, container],
  );

  const drag = useDraggable({ id, data, disabled });
  const drop = useDroppable({ id, data, disabled });

  const { setNodeRef: setDragRef } = drag;
  const { setNodeRef: setDropRef } = drop;

  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  const edge = useSyncExternalStore(store.subscribe, () => {
    const snapshot = store.get();

    return snapshot.overId === id ? snapshot.side : null;
  });

  return {
    setNodeRef,
    // For a dedicated grip: pointer and keyboard (Space to lift, arrows, Space to drop).
    handleProps: { ...drag.attributes, ...drag.listeners },
    // For an item that is itself a control (a tab, a toolbar button): pointer
    // only, so Enter and Space keep meaning what they meant.
    pointerProps: {
      onPointerDown: drag.listeners?.onPointerDown as
        PointerEventHandler | undefined,
    },
    isDragging: drag.isDragging,
    edge,
  };
}

export function useReorderContainer(
  id: string,
  { group, axis, disabled = false }: Omit<ReorderItemOptions, "container">,
) {
  const store = useReorderStore();

  const data = useMemo<ReorderData>(
    () => ({ group, axis, kind: "container" }),
    [group, axis],
  );

  const { setNodeRef } = useDroppable({ id, data, disabled });

  const isTarget = useSyncExternalStore(store.subscribe, () => {
    const snapshot = store.get();

    return snapshot.overId === id && snapshot.side === null;
  });

  return { setNodeRef, isTarget };
}

import {
  PointerSensor,
  useSensor,
  useSensors,
  type ClientRect,
  type Collision,
  type CollisionDetection,
  type DragOverEvent,
  type DroppableContainer,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { useCallback, useState } from "react";

import type { IColumn, Todo } from "@/types/data";

export interface TodoIndicator {
  columnId: string | null;
  index: number;
}

/** Droppable `data.type` values used across the board. */
export type DropType = "column" | "column-gap" | "todo-gap";

/** How far (px) the pointer may sit outside a column and still target it. */
const COLUMN_HOVER_DISTANCE = 80;

const EMPTY_INDICATOR: TodoIndicator = { columnId: null, index: 0 };

function distanceToRect(rect: ClientRect, x: number, y: number) {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);

  return Math.hypot(dx, dy);
}

function pickNearest(
  containers: DroppableContainer[],
  distance: (rect: ClientRect) => number,
  maxDistance = Number.POSITIVE_INFINITY,
) {
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

  if (!best || bestDistance > maxDistance) return null;

  return { container: best, distance: bestDistance };
}

function toCollisions(
  hit: { container: DroppableContainer; distance: number } | null,
): Collision[] {
  if (!hit) return [];

  return [
    {
      id: hit.container.id,
      data: { droppableContainer: hit.container, value: hit.distance },
    },
  ];
}

function typeOf(container: DroppableContainer) {
  return container.data.current?.type as DropType | undefined;
}

/**
 * A gap that touches the dragged item is where it already sits — dropping there
 * changes nothing, so we offer no target at all instead of drawing a line
 * around the item itself.
 */
function touchesActive(
  hit: { container: DroppableContainer } | null,
  activeId: UniqueIdentifier,
) {
  const data = hit?.container.data.current;

  return data?.beforeId === activeId || data?.afterId === activeId;
}

export default function useKanbanDnd() {
  const [activeTodo, setActiveTodo] = useState<Todo | null>(null);
  const [activeColumn, setActiveColumn] = useState<IColumn | null>(null);

  /** Gap the todo will be dropped into: `{ columnId, index }`. */
  const [indicator, setIndicator] = useState<TodoIndicator>(EMPTY_INDICATOR);
  /** Gap the column will be dropped into: index in the ordered column list. */
  const [columnIndicator, setColumnIndicator] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  /**
   * Nothing in the board reflows while dragging, so collisions are resolved
   * purely against the pointer: we look for the gap whose centre is closest to
   * the cursor instead of waiting for the cursor to land inside it.
   */
  const collisionDetection = useCallback<CollisionDetection>(
    ({ active, droppableContainers, pointerCoordinates }) => {
      if (!pointerCoordinates) return [];

      const { x, y } = pointerCoordinates;
      const activeType = active.data.current?.type as string | undefined;

      // ---- dragging a column: nearest gap between columns -------------------
      if (activeType === "column") {
        const gaps = droppableContainers.filter(
          (container) => typeOf(container) === "column-gap",
        );

        const hit = pickNearest(gaps, (rect) =>
          Math.abs(rect.left + rect.width / 2 - x),
        );

        if (touchesActive(hit, active.id)) return [];

        return toCollisions(hit);
      }

      // ---- dragging a todo: hovered column, then nearest gap inside it ------
      const columns = droppableContainers.filter(
        (container) => typeOf(container) === "column",
      );

      const column = pickNearest(
        columns,
        (rect) => distanceToRect(rect, x, y),
        COLUMN_HOVER_DISTANCE,
      );

      if (!column) return [];

      const gaps = droppableContainers.filter(
        (container) =>
          typeOf(container) === "todo-gap" &&
          container.data.current?.columnId === column.container.id,
      );

      // Empty column: fall back to the column itself.
      if (!gaps.length) return toCollisions(column);

      const hit = pickNearest(gaps, (rect) =>
        Math.abs(rect.top + rect.height / 2 - y),
      );

      if (touchesActive(hit, active.id)) return [];

      return toCollisions(hit);
    },
    [],
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const data = event.over?.data.current as
      | { type?: DropType; columnId?: string; index?: number }
      | undefined;

    if (!data) {
      setIndicator(EMPTY_INDICATOR);
      setColumnIndicator(null);
      return;
    }

    if (data.type === "column-gap") {
      setColumnIndicator(data.index ?? null);
      return;
    }

    if (data.type === "todo-gap") {
      setIndicator({ columnId: data.columnId ?? null, index: data.index ?? 0 });
      return;
    }

    if (data.type === "column") {
      // empty column
      setIndicator({ columnId: data.columnId ?? null, index: 0 });
    }
  }, []);

  const resetDrag = useCallback(() => {
    setActiveTodo(null);
    setActiveColumn(null);
    setIndicator(EMPTY_INDICATOR);
    setColumnIndicator(null);
  }, []);

  return {
    sensors,
    collisionDetection,
    handleDragOver,

    activeTodo,
    setActiveTodo,
    activeColumn,
    setActiveColumn,

    indicator,
    setIndicator,
    columnIndicator,
    setColumnIndicator,

    resetDrag,
  };
}

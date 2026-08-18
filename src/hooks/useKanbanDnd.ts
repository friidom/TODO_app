import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type ClientRect,
  type Collision,
  type CollisionDetection,
  type DragOverEvent,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { useCallback, useState } from "react";

import {
  isArrowKey,
  nextColumnGap,
  nextTodoGap,
  type GapRef,
} from "@/hooks/keyboardDrag";
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

function centreOf(rect: ClientRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** A droppable reduced to what `keyboardDrag` needs, dropping its rect. */
function toGapRef(container: DroppableContainer): GapRef {
  const data = container.data.current ?? {};

  return {
    id: String(container.id),
    columnId: (data.columnId as string | undefined) ?? null,
    index: (data.index as number | undefined) ?? 0,
    beforeId: (data.beforeId as string | undefined) ?? null,
    afterId: (data.afterId as string | undefined) ?? null,
  };
}

/**
 * Where a keyboard drag goes on each arrow press (M9-01).
 *
 * **It answers in coordinates because that is the only language dnd-kit's
 * sensors speak**, but it decides in indices: `keyboardDrag` picks the target
 * gap, and this turns that gap's centre into the translation that puts the
 * dragged item's centre on it. The collision detection below then resolves that
 * position to the same gap through the ordinary distance measurement, so the
 * keyboard and the pointer converge on one code path rather than two — which is
 * what makes "keyboard and pointer produce identical results" true by
 * construction instead of by testing.
 *
 * Returning nothing leaves the drag where it is, which is the right answer for
 * a key with no meaning here and for an edge the drag has already reached.
 */
const keyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context },
) => {
  if (!isArrowKey(event.key)) return;

  const { active, collisionRect, droppableContainers } = context;

  if (!active || !collisionRect) return;

  // The drag has to stay put rather than scroll the board out from under
  // itself, which is what an unhandled arrow key would do.
  event.preventDefault();

  const activeId = String(active.id);
  const containers = droppableContainers.getEnabled();
  const centre = centreOf(collisionRect);

  /** The gap the dragged item is currently over, by measurement. */
  function currentGap(gaps: DroppableContainer[], axis: "x" | "y") {
    let best: DroppableContainer | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const container of gaps) {
      const rect = container.rect.current;

      if (!rect) continue;

      const value = Math.abs(centreOf(rect)[axis] - centre[axis]);

      if (value < bestDistance) {
        bestDistance = value;
        best = container;
      }
    }

    return best;
  }

  function coordinatesFor(id: string) {
    const rect = containers.find((it) => String(it.id) === id)?.rect.current;

    if (!rect) return;

    const target = centreOf(rect);

    // A translation, not a position: dnd-kit moves the dragged node by the
    // difference from where the drag began, so what is returned has to be the
    // current coordinates plus how far the item still has to travel.
    return {
      x: currentCoordinates.x + (target.x - centre.x),
      y: currentCoordinates.y + (target.y - centre.y),
    };
  }

  if (active.data.current?.type === "column") {
    const gaps = containers.filter(
      (container) => typeOf(container) === "column-gap",
    );

    const from = currentGap(gaps, "x");

    if (!from) return;

    const next = nextColumnGap(
      gaps.map(toGapRef),
      toGapRef(from).index,
      event.key,
      activeId,
    );

    return next ? coordinatesFor(next.id) : undefined;
  }

  const gaps = containers.filter(
    (container) => typeOf(container) === "todo-gap",
  );

  const from = currentGap(gaps, "y");

  if (!from) return;

  // The columns left to right, taken from the gaps themselves rather than from
  // the board's state — this runs inside a sensor and has no access to the
  // ordered column list, and the rects are the truth about what is on screen.
  const columnIds = [
    ...new Map(
      gaps
        .filter((container) => container.rect.current)
        .sort(
          (a, b) => centreOf(a.rect.current!).x - centreOf(b.rect.current!).x,
        )
        .map((container) => [
          String(container.data.current?.columnId),
          true as const,
        ]),
    ).keys(),
  ];

  const next = nextTodoGap(
    gaps.map(toGapRef),
    columnIds,
    toGapRef(from),
    event.key,
    activeId,
  );

  return next ? coordinatesFor(next.id) : undefined;
};

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
    // M9-01. Added alongside the pointer sensor rather than replacing anything:
    // dnd-kit picks the sensor whose activator fired, so a mouse drag never
    // reaches this one and nothing about the pointer path changed.
    //
    // Space and Enter start and finish the drag, Escape cancels — all three are
    // dnd-kit's defaults and none of them is worth re-specifying. Only the
    // arrows needed a board-shaped answer.
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  /**
   * Nothing in the board reflows while dragging, so collisions are resolved
   * purely against the pointer: we look for the gap whose centre is closest to
   * the cursor instead of waiting for the cursor to land inside it.
   */
  const collisionDetection = useCallback<CollisionDetection>(
    ({ active, collisionRect, droppableContainers, pointerCoordinates }) => {
      // **The keyboard's half of M9-01, and it is one line here because the
      // work is in `keyboardCoordinates` above.** A keyboard drag has no
      // cursor, so `pointerCoordinates` is null and this used to return no
      // collisions at all — the board was pointer-only at exactly this line.
      // The dragged item's own centre is the honest substitute: the coordinate
      // getter has already put it on the gap it means to target, so measuring
      // from it resolves to that gap and both input methods run the same
      // distance comparison from here down.
      const point =
        pointerCoordinates ?? (collisionRect && centreOf(collisionRect));

      if (!point) return [];

      const { x, y } = point;
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
      { type?: DropType; columnId?: string; index?: number } | undefined;

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

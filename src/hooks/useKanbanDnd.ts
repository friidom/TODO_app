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

export type DropType = "column" | "column-gap" | "todo-gap";

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

// a gap touching the dragged item is where it already sits — no point offering that as a target
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

// dnd-kit sensors only speak coordinates, so this converts keyboardDrag's chosen gap into a translation —
// collision detection below then resolves that position back to the same gap, keeping keyboard and pointer on one path
const keyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context },
) => {
  if (!isArrowKey(event.key)) return;

  const { active, collisionRect, droppableContainers } = context;

  if (!active || !collisionRect) return;

  // otherwise an unhandled arrow key scrolls the board out from under the drag
  event.preventDefault();

  const activeId = String(active.id);
  const containers = droppableContainers.getEnabled();
  const centre = centreOf(collisionRect);

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

    // a translation, not a position — dnd-kit moves the node by the delta from where the drag began
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

  // columns left to right, read from the gap rects — this runs inside a sensor with no access to board state
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

  const [indicator, setIndicator] = useState<TodoIndicator>(EMPTY_INDICATOR);
  const [columnIndicator, setColumnIndicator] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    // Space/Enter/Escape are dnd-kit's defaults; only the arrow keys needed a board-shaped coordinate getter
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  // nothing reflows while dragging, so we just find the gap whose centre is nearest the cursor
  const collisionDetection = useCallback<CollisionDetection>(
    ({ active, collisionRect, droppableContainers, pointerCoordinates }) => {
      // no cursor on a keyboard drag — fall back to the dragged item's own centre, which keyboardCoordinates already placed on the target gap
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

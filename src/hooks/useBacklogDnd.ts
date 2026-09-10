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

export type BacklogDropType = "backlog-section" | "backlog-gap";

export interface BacklogIndicator {
  sectionKey: string | null;
  index: number;
}

const SECTION_HOVER_DISTANCE = 80;

function centreOf(rect: ClientRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

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
  return container.data.current?.type as BacklogDropType | undefined;
}

// a gap touching the dragged item is where it already sits — suppress it, don't draw a line around the item itself
function touchesActive(
  hit: { container: DroppableContainer } | null,
  activeId: UniqueIdentifier,
) {
  const data = hit?.container.data.current;

  return data?.beforeId === activeId || data?.afterId === activeId;
}

// indicator is null when idle, not a sentinel object — sectionKey: null is a real destination (the ungrouped list) here
export default function useBacklogDnd() {
  const [indicator, setIndicator] = useState<BacklogIndicator | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // nothing reflows while dragging — only the DragOverlay moves, so collisions resolve against the pointer
  const collisionDetection = useCallback<CollisionDetection>(
    ({ active, collisionRect, droppableContainers, pointerCoordinates }) => {
      const point =
        pointerCoordinates ?? (collisionRect && centreOf(collisionRect));

      if (!point) return [];

      const { x, y } = point;

      // nearest section
      const sections = droppableContainers.filter(
        (container) => typeOf(container) === "backlog-section",
      );

      const section = pickNearest(
        sections,
        (rect) => distanceToRect(rect, x, y),
        SECTION_HOVER_DISTANCE,
      );

      if (!section) return [];

      const sectionKey = section.container.data.current?.sectionKey as
        | string
        | null
        | undefined;

      // nearest gap inside it
      const gaps = droppableContainers.filter(
        (container) =>
          typeOf(container) === "backlog-gap" &&
          container.data.current?.sectionKey === sectionKey,
      );

      if (!gaps.length) return toCollisions(section);

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
      | { type?: BacklogDropType; sectionKey?: string | null; index?: number }
      | undefined;

    if (!data) {
      setIndicator(null);
      return;
    }

    if (data.type === "backlog-gap") {
      setIndicator({
        sectionKey: data.sectionKey ?? null,
        index: data.index ?? 0,
      });
      return;
    }

    if (data.type === "backlog-section") {
      // empty section, no gap to name — drop lands at 0
      setIndicator({ sectionKey: data.sectionKey ?? null, index: 0 });
    }
  }, []);

  const resetDrag = useCallback(() => {
    setIndicator(null);
  }, []);

  return {
    sensors,
    collisionDetection,
    handleDragOver,
    indicator,
    resetDrag,
  };
}

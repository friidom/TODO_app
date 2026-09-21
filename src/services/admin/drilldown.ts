import type { AdminActivityRow, AdminBoard, SpaceMetrics } from "./types";

export interface Crumb {
  label: string;
  to?: string;
}

export function taskTarget(
  entry: Pick<AdminActivityRow, "entity_type" | "entity_id">,
): string | null {
  return entry.entity_type === "todo" && entry.entity_id !== null
    ? entry.entity_id
    : null;
}

export function boardTrail(
  board: Pick<AdminBoard, "title" | "space_id" | "space_title">,
): Crumb[] {
  const trail: Crumb[] = [{ label: "Boards", to: "/admin/boards" }];

  if (board.space_id !== null) {
    trail.push({
      label: board.space_title ?? "Space",
      to: `/admin/spaces/${board.space_id}`,
    });
  }

  return [...trail, { label: board.title ?? "Untitled board" }];
}

export function spaceTrail(space: Pick<SpaceMetrics, "title">): Crumb[] {
  return [{ label: "All spaces", to: "/admin/spaces" }, { label: space.title }];
}

// The Unfiled bucket is a grouping, not a row anything can open.
export function spaceTarget(
  space: Pick<SpaceMetrics, "id">,
  period: string,
): string | null {
  return space.id === null
    ? null
    : `/admin/spaces/${space.id}?period=${period}`;
}

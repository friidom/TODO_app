import { freeSpot, type Point } from "./diagramLayout";

// Where the reader put each status on the diagram, per board and per device.
// View state only — never published — stored the way the List's column widths
// are, and guarded the same way: a private window throws rather than returning
// null, and the editor must still open.
function keyOf(boardId: string): string {
  return `workflow:positions:${boardId}`;
}

export function normalizePositions(value: unknown): Record<string, Point> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const positions: Record<string, Point> = {};

  for (const [id, point] of Object.entries(value)) {
    if (typeof point !== "object" || point === null) continue;

    const { x, y } = point as Record<string, unknown>;

    if (
      typeof x === "number" &&
      typeof y === "number" &&
      Number.isFinite(x) &&
      Number.isFinite(y)
    ) {
      positions[id] = { x, y };
    }
  }

  return positions;
}

export function readPositions(
  boardId: string | undefined,
): Record<string, Point> {
  if (!boardId) return {};

  try {
    const stored = localStorage.getItem(keyOf(boardId));

    return stored === null ? {} : normalizePositions(JSON.parse(stored));
  } catch {
    return {};
  }
}

export function writePositions(
  boardId: string | undefined,
  positions: Record<string, Point>,
): void {
  if (!boardId) return;

  try {
    localStorage.setItem(
      keyOf(boardId),
      JSON.stringify(normalizePositions(positions)),
    );
  } catch {
    // A layout that cannot be remembered is not worth failing the editor for.
  }
}

// Every status gets a place: the stored one if it has one, otherwise where the
// auto layout would put it, moved down clear of the stored ones. Positions of
// statuses that are gone are dropped.
export function mergePositions(
  ids: readonly string[],
  stored: Record<string, Point>,
  auto: Record<string, Point>,
): Record<string, Point> {
  const merged: Record<string, Point> = {};

  for (const id of ids) {
    if (stored[id]) merged[id] = stored[id];
  }

  for (const id of ids) {
    if (!merged[id]) merged[id] = freeSpot(merged, auto[id] ?? { x: 0, y: 0 });
  }

  return merged;
}

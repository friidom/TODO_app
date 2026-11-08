// The Timeline's left-hand columns, one CSS variable each, so a resize reflows
// the rail, the header, the axis and the today line in CSS without a render.

export const TIMELINE_COLUMN_IDS = ["work", "status", "assignee"] as const;

export type TimelineColumnId = (typeof TIMELINE_COLUMN_IDS)[number];

export const TIMELINE_COLUMNS: Record<
  TimelineColumnId,
  { width: number; min: number; optional: boolean }
> = {
  work: { width: 280, min: 180, optional: false },
  status: { width: 116, min: 84, optional: true },
  assignee: { width: 140, min: 96, optional: true },
};

export const MAX_TIMELINE_COLUMN_WIDTH = 640;

export interface TimelineColumnPrefs {
  widths: Partial<Record<TimelineColumnId, number>>;
  hidden: TimelineColumnId[];
}

export const DEFAULT_TIMELINE_COLUMNS: TimelineColumnPrefs = {
  widths: {},
  hidden: [],
};

const isColumnId = (value: unknown): value is TimelineColumnId =>
  typeof value === "string" &&
  (TIMELINE_COLUMN_IDS as readonly string[]).includes(value);

export function clampTimelineColumnWidth(
  id: TimelineColumnId,
  width: number,
): number {
  return Math.round(
    Math.min(
      MAX_TIMELINE_COLUMN_WIDTH,
      Math.max(TIMELINE_COLUMNS[id].min, width),
    ),
  );
}

export function timelineColumnWidth(
  prefs: TimelineColumnPrefs,
  id: TimelineColumnId,
): number {
  return prefs.widths[id] ?? TIMELINE_COLUMNS[id].width;
}

export function isTimelineColumnShown(
  prefs: TimelineColumnPrefs,
  id: TimelineColumnId,
): boolean {
  return !TIMELINE_COLUMNS[id].optional || !prefs.hidden.includes(id);
}

export function withTimelineColumnWidth(
  prefs: TimelineColumnPrefs,
  id: TimelineColumnId,
  width: number | null,
): TimelineColumnPrefs {
  const widths = { ...prefs.widths };

  if (width === null) delete widths[id];
  else widths[id] = clampTimelineColumnWidth(id, width);

  return { ...prefs, widths };
}

export function withTimelineColumnShown(
  prefs: TimelineColumnPrefs,
  id: TimelineColumnId,
  shown: boolean,
): TimelineColumnPrefs {
  if (!TIMELINE_COLUMNS[id].optional) return prefs;

  const hidden = prefs.hidden.filter((other) => other !== id);

  return { ...prefs, hidden: shown ? hidden : [...hidden, id] };
}

export function railVariables(
  prefs: TimelineColumnPrefs,
): Record<`--tl-${TimelineColumnId}`, string> {
  const px = (id: TimelineColumnId) =>
    isTimelineColumnShown(prefs, id)
      ? `${timelineColumnWidth(prefs, id)}px`
      : "0px";

  return {
    "--tl-work": px("work"),
    "--tl-status": px("status"),
    "--tl-assignee": px("assignee"),
  };
}

export function normalizeTimelineColumns(value: unknown): TimelineColumnPrefs {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_TIMELINE_COLUMNS;
  }

  const raw = value as { widths?: unknown; hidden?: unknown };
  let prefs: TimelineColumnPrefs = { widths: {}, hidden: [] };

  if (typeof raw.widths === "object" && raw.widths !== null) {
    for (const [id, width] of Object.entries(raw.widths)) {
      if (
        isColumnId(id) &&
        typeof width === "number" &&
        Number.isFinite(width)
      ) {
        prefs = withTimelineColumnWidth(prefs, id, width);
      }
    }
  }

  if (Array.isArray(raw.hidden)) {
    for (const id of new Set(raw.hidden)) {
      if (isColumnId(id)) prefs = withTimelineColumnShown(prefs, id, false);
    }
  }

  return prefs;
}

const KEY = "timeline:columns";

// Per board and per device, like the List's widths; guarded because storage
// throws in a private window with site data blocked.
export function readTimelineColumns(boardId?: string): TimelineColumnPrefs {
  try {
    const stored = boardId ? localStorage.getItem(`${KEY}:${boardId}`) : null;

    return stored === null
      ? DEFAULT_TIMELINE_COLUMNS
      : normalizeTimelineColumns(JSON.parse(stored));
  } catch {
    return DEFAULT_TIMELINE_COLUMNS;
  }
}

export function writeTimelineColumns(
  boardId: string | undefined,
  prefs: TimelineColumnPrefs,
): void {
  if (!boardId) return;

  try {
    localStorage.setItem(`${KEY}:${boardId}`, JSON.stringify(prefs));
  } catch {
    // a preference that cannot be remembered is not worth failing a render for
  }
}

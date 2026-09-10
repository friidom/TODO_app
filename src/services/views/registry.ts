export const VIEW_MODES = [
  "summary",
  "board",
  "list",
  "calendar",
  "timeline",
  "backlog",
] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

export interface ViewCapabilities {
  // means "writes todos.position/rank", not "has drag and drop" — calendar and timeline both drag but stay false
  canReorder: boolean;
  canGroup: boolean;
  canSort: boolean;
}

export interface ViewDefinition {
  mode: ViewMode;
  label: string;
  capabilities: ViewCapabilities;
}

export const VIEWS: Record<ViewMode, ViewDefinition> = {
  summary: {
    mode: "summary",
    label: "Summary",
    capabilities: { canReorder: false, canGroup: false, canSort: false },
  },
  board: {
    mode: "board",
    label: "Board",
    capabilities: { canReorder: true, canGroup: true, canSort: true },
  },
  list: {
    mode: "list",
    label: "List",
    capabilities: { canReorder: false, canGroup: true, canSort: true },
  },
  calendar: {
    mode: "calendar",
    label: "Calendar",
    // drop writes due_date, not position, so this stays false even though it drags
    capabilities: { canReorder: false, canGroup: false, canSort: false },
  },
  timeline: {
    mode: "timeline",
    label: "Timeline",
    // rows are ordered by start_date at render time, never stored — dragging a bar writes dates, not position
    capabilities: { canReorder: false, canGroup: false, canSort: false },
  },
  backlog: {
    mode: "backlog",
    label: "Backlog",
    // reorders its own backlog_rank column, a separate field from board's rank, so this doesn't collide with it
    capabilities: { canReorder: true, canGroup: false, canSort: false },
  },
};

export function isViewMode(value: unknown): value is ViewMode {
  return (
    typeof value === "string" &&
    (VIEW_MODES as readonly string[]).includes(value)
  );
}

export function capabilitiesOf(mode: ViewMode): ViewCapabilities {
  return VIEWS[mode].capabilities;
}

export function reorderingViews(): ViewMode[] {
  return VIEW_MODES.filter((mode) => VIEWS[mode].capabilities.canReorder);
}

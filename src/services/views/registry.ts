import i18n from "@/components/i18n";

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
    get label() {
      return i18n.t("views.summary");
    },
    capabilities: { canReorder: false, canGroup: false, canSort: false },
  },
  board: {
    mode: "board",
    get label() {
      return i18n.t("views.board");
    },
    capabilities: { canReorder: true, canGroup: true, canSort: true },
  },
  list: {
    mode: "list",
    get label() {
      return i18n.t("views.list");
    },
    // its manual order IS the board's (orderByBoard), so a row drag writes the same rank the Board does — no order of its own
    capabilities: { canReorder: true, canGroup: true, canSort: true },
  },
  calendar: {
    mode: "calendar",
    get label() {
      return i18n.t("views.calendar");
    },
    // drop writes due_date, not position, so this stays false even though it drags
    capabilities: { canReorder: false, canGroup: false, canSort: false },
  },
  timeline: {
    mode: "timeline",
    get label() {
      return i18n.t("views.timeline");
    },
    // rows are ordered by start_date at render time, never stored — dragging a bar writes dates, not position
    capabilities: { canReorder: false, canGroup: false, canSort: false },
  },
  backlog: {
    mode: "backlog",
    get label() {
      return i18n.t("views.backlog");
    },
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

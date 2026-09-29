import { reorder, type Side } from "@/utils/reorder";

import { VIEWS, VIEW_MODES, isViewMode, type ViewMode } from "./registry";

export interface ViewTab {
  mode: ViewMode;
  label: string | null;
  hidden: boolean;
}

// The server's limit, boards.schema.ts.
export const TAB_LABEL_MAX = 40;

// BoardPage renders Board for any mode it cannot, so Board is the one tab that
// must always be there to land on.
const ALWAYS_SHOWN: ViewMode = "board";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A label equal to the built-in name is stored as null, so renaming a tab back
// by hand is the default again rather than a copy that outlives a registry rename.
function cleanLabel(mode: ViewMode, label: unknown): string | null {
  if (typeof label !== "string") return null;

  const clean = label.trim().slice(0, TAB_LABEL_MAX).trim();

  return clean && clean !== VIEWS[mode].label ? clean : null;
}

// boards.view_tabs can be stale: a view the registry dropped, a duplicate, or a
// view added since it was saved. Repairing on read means every view appears
// exactly once whatever the board holds.
export function normalizeTabs(stored: unknown): ViewTab[] {
  const tabs: ViewTab[] = [];
  const seen = new Set<ViewMode>();

  for (const entry of Array.isArray(stored) ? stored : []) {
    if (!isRecord(entry) || !isViewMode(entry.mode) || seen.has(entry.mode)) {
      continue;
    }

    seen.add(entry.mode);
    tabs.push({
      mode: entry.mode,
      label: cleanLabel(entry.mode, entry.label),
      hidden: entry.hidden === true && entry.mode !== ALWAYS_SHOWN,
    });
  }

  for (const mode of VIEW_MODES) {
    if (!seen.has(mode)) tabs.push({ mode, label: null, hidden: false });
  }

  return tabs;
}

export function isDefaultTabs(tabs: readonly ViewTab[]): boolean {
  return (
    tabs.length === VIEW_MODES.length &&
    tabs.every(
      (tab, index) =>
        tab.mode === VIEW_MODES[index] && tab.label === null && !tab.hidden,
    )
  );
}

export function tabLabel(tab: ViewTab): string {
  return tab.label ?? VIEWS[tab.mode].label;
}

export function canHideTab(mode: ViewMode): boolean {
  return mode !== ALWAYS_SHOWN;
}

// Backlog is the sprint planning surface, so it goes with the feature.
function offered(mode: ViewMode, sprintsEnabled: boolean): boolean {
  return sprintsEnabled || mode !== "backlog";
}

// The open view is shown even when hidden, so a deep link to it still has an
// active tab.
export function shownTabs(
  tabs: readonly ViewTab[],
  { sprintsEnabled, current }: { sprintsEnabled: boolean; current: ViewMode },
): ViewTab[] {
  return tabs.filter(
    (tab) =>
      offered(tab.mode, sprintsEnabled) &&
      (!tab.hidden || tab.mode === current),
  );
}

export function hiddenTabs(
  tabs: readonly ViewTab[],
  { sprintsEnabled }: { sprintsEnabled: boolean },
): ViewTab[] {
  return tabs.filter((tab) => tab.hidden && offered(tab.mode, sprintsEnabled));
}

// The drag names shown tabs only. "before X" lands directly before X in the
// stored list too, so hidden tabs keep their slots.
export function moveTab(
  tabs: readonly ViewTab[],
  active: ViewMode,
  over: ViewMode,
  side: Side,
): ViewTab[] {
  const byMode = new Map(tabs.map((tab) => [tab.mode, tab]));

  return reorder(
    tabs.map((tab) => tab.mode),
    active,
    over,
    side,
  ).map((mode) => byMode.get(mode)!);
}

export function renameTab(
  tabs: readonly ViewTab[],
  mode: ViewMode,
  label: string | null,
): ViewTab[] {
  return tabs.map((tab) =>
    tab.mode === mode ? { ...tab, label: cleanLabel(mode, label) } : tab,
  );
}

export function hideTab(tabs: readonly ViewTab[], mode: ViewMode): ViewTab[] {
  if (!canHideTab(mode)) return [...tabs];

  return tabs.map((tab) =>
    tab.mode === mode ? { ...tab, hidden: true } : tab,
  );
}

// Appended rather than returned to its old slot: "where did it go?" is a worse
// answer than "on the end".
export function showTab(tabs: readonly ViewTab[], mode: ViewMode): ViewTab[] {
  const tab = tabs.find((it) => it.mode === mode);

  if (!tab?.hidden) return [...tabs];

  return [...tabs.filter((it) => it !== tab), { ...tab, hidden: false }];
}

export type DefaultViews = Record<string, ViewMode>;

export function defaultViewOf(
  views: DefaultViews,
  boardId: string | undefined,
): ViewMode {
  const mode = boardId ? views[boardId] : undefined;

  // isViewMode, not a truthiness check: a board id like "constructor" reads a
  // prototype member rather than undefined.
  return isViewMode(mode) ? mode : "board";
}

// Board is what a board opens on without an entry, so it is never stored.
export function withDefaultView(
  views: DefaultViews,
  boardId: string,
  mode: ViewMode,
): DefaultViews {
  const next = { ...views };

  if (mode === "board") delete next[boardId];
  else next[boardId] = mode;

  return next;
}

export function parseDefaultViews(raw: unknown): DefaultViews {
  const views: DefaultViews = {};

  if (!isRecord(raw)) return views;

  for (const [boardId, mode] of Object.entries(raw)) {
    if (isViewMode(mode) && mode !== "board") views[boardId] = mode;
  }

  return views;
}

const KEY = "board:default-view";

// Per person and per device, like the List's columns: which tab you land on is
// a habit of the reader, not a fact about the board. Guarded because
// localStorage throws in a private window with site data blocked.
export function readDefaultViews(): DefaultViews {
  try {
    const stored = localStorage.getItem(KEY);

    return stored === null ? {} : parseDefaultViews(JSON.parse(stored));
  } catch {
    return {};
  }
}

export function writeDefaultViews(views: DefaultViews): void {
  try {
    if (Object.keys(views).length) {
      localStorage.setItem(KEY, JSON.stringify(views));
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    // A preference that cannot be remembered is not worth failing a render for.
  }
}

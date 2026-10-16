import {
  FILTER_IDS,
  isFilterId,
  type FilterId,
} from "@/services/filters/registry";
import type { SpaceGroup } from "@/services/spaces/groupBoards";

export const SIDEBAR_SECTIONS = ["spaces", "filters"] as const;

export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];

export const UNFILED = "unfiled";

export interface SidebarLayout {
  sections: SidebarSection[];
  spaces: string[];
  boards: Record<string, string[]>;
  filters: FilterId[];
  collapsed: string[];
}

export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = {
  sections: [...SIDEBAR_SECTIONS],
  spaces: [],
  boards: {},
  filters: [...FILTER_IDS],
  // nine filters under the boards would push them off the first screen
  collapsed: ["filters"],
};

const KEY = "sidebar:layout";

export function isSidebarSection(value: unknown): value is SidebarSection {
  return (
    typeof value === "string" &&
    (SIDEBAR_SECTIONS as readonly string[]).includes(value)
  );
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((it): it is string => typeof it === "string"))]
    : [];
}

// one added after someone saved their order is appended rather than never shown
function complete<T extends string>(
  raw: unknown,
  all: readonly T[],
  isKnown: (value: unknown) => value is T,
): T[] {
  const order = [...new Set(strings(raw).filter(isKnown))];

  return [...order, ...all.filter((id) => !order.includes(id))];
}

export function normalizeSidebarLayout(raw: unknown): SidebarLayout {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return DEFAULT_SIDEBAR_LAYOUT;
  }

  const value = raw as Record<string, unknown>;
  const boards: Record<string, string[]> = {};

  if (
    typeof value.boards === "object" &&
    value.boards !== null &&
    !Array.isArray(value.boards)
  ) {
    for (const [space, ids] of Object.entries(value.boards)) {
      boards[space] = strings(ids);
    }
  }

  return {
    sections: complete(value.sections, SIDEBAR_SECTIONS, isSidebarSection),
    spaces: strings(value.spaces),
    boards,
    filters: complete(value.filters, FILTER_IDS, isFilterId),
    collapsed: Array.isArray(value.collapsed)
      ? strings(value.collapsed)
      : DEFAULT_SIDEBAR_LAYOUT.collapsed,
  };
}

// Guarded, because a private window throws on access rather than returning null.
export function readSidebarLayout(): SidebarLayout {
  try {
    const stored = localStorage.getItem(KEY);

    return stored === null
      ? DEFAULT_SIDEBAR_LAYOUT
      : normalizeSidebarLayout(JSON.parse(stored));
  } catch {
    return DEFAULT_SIDEBAR_LAYOUT;
  }
}

export function writeSidebarLayout(layout: SidebarLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // A preference that cannot be remembered is not worth failing a drag for.
  }
}

export function orderBy<T>(
  items: readonly T[],
  saved: readonly string[] | undefined,
  idOf: (item: T) => string,
): T[] {
  if (!saved?.length) return [...items];

  const rank = new Map(saved.map((id, index) => [id, index]));
  const at = (item: T) => rank.get(idOf(item)) ?? saved.length;

  return [...items].sort((a, b) => at(a) - at(b));
}

export const spaceKeyOf = (group: SpaceGroup) => group.space?.id ?? UNFILED;

// Unfiled stays last: it is not a space of the reader.s to arrange.
export function arrangeGroups(
  groups: SpaceGroup[],
  layout: SidebarLayout,
): SpaceGroup[] {
  const filed = groups.filter((group) => group.space !== null);
  const unfiled = groups.filter((group) => group.space === null);

  return [...orderBy(filed, layout.spaces, spaceKeyOf), ...unfiled].map(
    (group) => ({
      ...group,
      boards: orderBy(
        group.boards,
        layout.boards[spaceKeyOf(group)],
        (board) => board.id,
      ),
    }),
  );
}

export function toggleCollapsed(
  layout: SidebarLayout,
  key: string,
): SidebarLayout {
  return {
    ...layout,
    collapsed: layout.collapsed.includes(key)
      ? layout.collapsed.filter((it) => it !== key)
      : [...layout.collapsed, key],
  };
}

// A board is confined to its own space: moving it to another would re-file it,
// a write to the board, not a change to how the reader views the nav.
export const SIDEBAR_DND = {
  section: "sidebar-section",
  space: "sidebar-space",
  board: "sidebar-board",
  filter: "sidebar-filter",
} as const;

export type SidebarList = keyof typeof SIDEBAR_DND;

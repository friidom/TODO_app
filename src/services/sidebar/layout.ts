import {
  FILTER_IDS,
  isFilterId,
  type FilterId,
} from "@/services/filters/registry";
import type { SpaceGroup } from "@/services/spaces/groupBoards";
import { reorder, type Side } from "@/utils/reorder";

export const SIDEBAR_NAV = [
  "for-you",
  "recent",
  "starred",
  "admin",
  "notifications",
] as const;

export type SidebarNavItem = (typeof SIDEBAR_NAV)[number];

export const SIDEBAR_SECTIONS = ["spaces", "filters"] as const;

export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];

export const UNFILED = "unfiled";

export interface SidebarLayout {
  nav: SidebarNavItem[];
  sections: SidebarSection[];
  spaces: string[];
  boards: Record<string, string[]>;
  filters: FilterId[];
  collapsed: string[];
  // nav items, sections, spaces, boards and filters share one list; their ids never collide
  hidden: string[];
}

export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = {
  nav: [...SIDEBAR_NAV],
  sections: [...SIDEBAR_SECTIONS],
  spaces: [],
  boards: {},
  filters: [...FILTER_IDS],
  // nine filters under the boards would push them off the first screen
  collapsed: ["filters"],
  hidden: [],
};

const KEY = "sidebar:layout";

function isOneOf<T extends string>(all: readonly T[]) {
  return (value: unknown): value is T =>
    typeof value === "string" && (all as readonly string[]).includes(value);
}

export const isSidebarNavItem = isOneOf(SIDEBAR_NAV);

export const isSidebarSection = isOneOf(SIDEBAR_SECTIONS);

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
    nav: complete(value.nav, SIDEBAR_NAV, isSidebarNavItem),
    sections: complete(value.sections, SIDEBAR_SECTIONS, isSidebarSection),
    spaces: strings(value.spaces),
    boards,
    filters: complete(value.filters, FILTER_IDS, isFilterId),
    collapsed: Array.isArray(value.collapsed)
      ? strings(value.collapsed)
      : DEFAULT_SIDEBAR_LAYOUT.collapsed,
    hidden: strings(value.hidden),
  };
}

// Per user, so another account on this browser keeps its own sidebar. The
// device-wide layout from before that is read until someone first saves.
const keyOf = (userId: string) => `${KEY}:${userId}`;

// Guarded, because a private window throws on access rather than returning null.
export function readSidebarLayout(userId: string): SidebarLayout {
  try {
    const stored =
      localStorage.getItem(keyOf(userId)) ?? localStorage.getItem(KEY);

    return stored === null
      ? DEFAULT_SIDEBAR_LAYOUT
      : normalizeSidebarLayout(JSON.parse(stored));
  } catch {
    return DEFAULT_SIDEBAR_LAYOUT;
  }
}

export function writeSidebarLayout(
  userId: string,
  layout: SidebarLayout,
): void {
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(layout));
    localStorage.removeItem(KEY);
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

// Unfiled stays last: it is not a space of the reader's to arrange.
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

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((it) => it !== key) : [...list, key];
}

export function toggleCollapsed(
  layout: SidebarLayout,
  key: string,
): SidebarLayout {
  return { ...layout, collapsed: toggle(layout.collapsed, key) };
}

export function toggleHidden(layout: SidebarLayout, id: string): SidebarLayout {
  return { ...layout, hidden: toggle(layout.hidden, id) };
}

// Which sections are open was never part of what the reader customised.
export function restoreDefaults(layout: SidebarLayout): SidebarLayout {
  return { ...DEFAULT_SIDEBAR_LAYOUT, collapsed: layout.collapsed };
}

// A board is confined to its own space: moving it to another would re-file it,
// a write to the board, not a change to how the reader views the nav.
export const SIDEBAR_DND = {
  nav: "sidebar-nav",
  section: "sidebar-section",
  space: "sidebar-space",
  board: "sidebar-board",
  filter: "sidebar-filter",
} as const;

export type SidebarList = keyof typeof SIDEBAR_DND;

export function sidebarListOf(group: string): SidebarList | undefined {
  return (Object.keys(SIDEBAR_DND) as SidebarList[]).find(
    (list) => SIDEBAR_DND[list] === group,
  );
}

// Hidden ids included, so a move among the shown ones keeps their slots.
export function idsOf(
  list: SidebarList,
  layout: SidebarLayout,
  groups: SpaceGroup[],
  container?: string,
): string[] {
  switch (list) {
    case "nav":
      return layout.nav;
    case "section":
      return layout.sections;
    case "space":
      return groups.filter((group) => group.space).map(spaceKeyOf);
    case "board":
      return (
        groups
          .find((group) => spaceKeyOf(group) === container)
          ?.boards.map((board) => board.id) ?? []
      );
    case "filter":
      return layout.filters;
  }
}

export function withOrder(
  layout: SidebarLayout,
  list: SidebarList,
  ids: string[],
  container?: string,
): SidebarLayout {
  switch (list) {
    case "nav":
      return { ...layout, nav: complete(ids, SIDEBAR_NAV, isSidebarNavItem) };
    case "section":
      return {
        ...layout,
        sections: complete(ids, SIDEBAR_SECTIONS, isSidebarSection),
      };
    case "space":
      return { ...layout, spaces: ids };
    case "board":
      return container
        ? { ...layout, boards: { ...layout.boards, [container]: ids } }
        : layout;
    case "filter":
      return { ...layout, filters: complete(ids, FILTER_IDS, isFilterId) };
  }
}

export function moved(
  layout: SidebarLayout,
  groups: SpaceGroup[],
  list: SidebarList,
  move: { activeId: string; overId: string; side: Side; container?: string },
): SidebarLayout {
  const ids = idsOf(list, layout, groups, move.container);

  return withOrder(
    layout,
    list,
    reorder(ids, move.activeId, move.overId, move.side),
    move.container,
  );
}

export type ShownGroup = SpaceGroup & { away: number };

export interface SidebarView {
  nav: SidebarNavItem[];
  sections: SidebarSection[];
  groups: ShownGroup[];
  filters: FilterId[];
  more: { nav: SidebarNavItem[]; groups: SpaceGroup[]; filters: FilterId[] };
}

// What the sidebar shows, and what More holds instead. Hiding a section or a
// space takes everything under it along; nothing hidden is out of reach.
export function sidebarView(
  layout: SidebarLayout,
  groups: SpaceGroup[],
  admin: boolean,
): SidebarView {
  const hidden = new Set(layout.hidden);
  const nav = layout.nav.filter((id) => admin || id !== "admin");
  const spacesAway = hidden.has("spaces");
  const filtersAway = hidden.has("filters");

  const shown: ShownGroup[] = [];
  const away: SpaceGroup[] = [];

  for (const group of groups) {
    const out = spacesAway || hidden.has(spaceKeyOf(group));
    const gone = out
      ? group.boards
      : group.boards.filter((board) => hidden.has(board.id));

    if (!out) {
      shown.push({
        ...group,
        boards: group.boards.filter((board) => !hidden.has(board.id)),
        away: gone.length,
      });
    }

    if (gone.length) away.push({ ...group, boards: gone });
  }

  return {
    nav: nav.filter((id) => !hidden.has(id)),
    sections: layout.sections.filter((id) => !hidden.has(id)),
    groups: shown,
    filters: filtersAway ? [] : layout.filters.filter((id) => !hidden.has(id)),
    more: {
      nav: nav.filter((id) => hidden.has(id)),
      groups: away,
      filters: layout.filters.filter((id) => filtersAway || hidden.has(id)),
    },
  };
}

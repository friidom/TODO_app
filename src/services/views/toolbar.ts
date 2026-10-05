import { translated } from "@/components/i18n";
import { FILTER_CATEGORIES } from "@/services/todos/view";

export const TOOLBAR_CONTROL_IDS = [
  "search",
  "filter",
  "group",
  "sort",
] as const;

export type ToolbarControlId = (typeof TOOLBAR_CONTROL_IDS)[number];

export const TOOLBAR_LABELS = translated<ToolbarControlId>({
  search: "toolbar.search",
  filter: "toolbar.filter",
  group: "toolbar.group",
  sort: "toolbar.sort",
});

export function isToolbarControl(value: unknown): value is ToolbarControlId {
  return (
    typeof value === "string" &&
    (TOOLBAR_CONTROL_IDS as readonly string[]).includes(value)
  );
}

// A control added after someone saved their order is appended, rather than
// never appearing for them.
export function normalizeToolbarControls(
  ids: readonly unknown[],
): ToolbarControlId[] {
  const order: ToolbarControlId[] = [];

  for (const raw of ids) {
    // an order saved when each filter was its own chip: the first chip's slot becomes the Filter button's
    const id = (FILTER_CATEGORIES as readonly unknown[]).includes(raw)
      ? "filter"
      : raw;

    if (isToolbarControl(id) && !order.includes(id)) order.push(id);
  }

  for (const id of TOOLBAR_CONTROL_IDS) {
    if (!order.includes(id)) order.push(id);
  }

  return order;
}

export function isDefaultToolbarControls(
  ids: readonly ToolbarControlId[],
): boolean {
  return (
    ids.length === TOOLBAR_CONTROL_IDS.length &&
    ids.every((id, index) => id === TOOLBAR_CONTROL_IDS[index])
  );
}

const KEY = "toolbar:controls";

// Per-device for the reason list:columns is: the order is a reading habit, not
// a fact about the board. Guarded the same way, because a private window
// throws on access rather than returning null.
export function readToolbarControls(): ToolbarControlId[] {
  try {
    const stored = localStorage.getItem(KEY);

    if (stored === null) return [...TOOLBAR_CONTROL_IDS];

    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed)) return [...TOOLBAR_CONTROL_IDS];

    return normalizeToolbarControls(parsed);
  } catch {
    return [...TOOLBAR_CONTROL_IDS];
  }
}

export function writeToolbarControls(ids: readonly ToolbarControlId[]): void {
  try {
    const order = normalizeToolbarControls(ids);

    if (isDefaultToolbarControls(order)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // A preference that cannot be remembered is not worth failing a render for.
  }
}

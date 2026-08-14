import { columnTitle } from "@/constants/columns";
import { PRIORITIES, PRIORITY_OPTIONS } from "@/constants/priorities";
import { WORK_TYPE_OPTIONS } from "@/constants/workTypes";
import { memberName } from "@/components/members/memberLabels";
import type { BoardMember } from "@/services/members/membersApi";
import type { IColumn } from "@/types/data";
import { byRank } from "@/utils/rank";
import {
  DUE_BUCKETS,
  DUE_LABELS,
  ME,
  UNSET,
  type FilterCategory,
} from "./view";

/**
 * What a filter category offers, and what each option is called.
 *
 * **The searchable half of the filter panel, extracted so it can be tested.**
 * The panel lets you search *within* a field — "type three letters of a
 * teammate's name" — and that search runs over labels, so the labels have to
 * exist as data rather than as JSX. Splitting it here keeps the pure part pure:
 * this module decides which options exist and what they are named, and the
 * component decides what they look like, reading icons and tones from the same
 * `PRIORITIES` / `WORK_TYPES` / `categoryOf` constants that already hold them.
 *
 * It does **not** hold selection state. Which values are ticked is
 * `TodoFilters` in the URL, exactly as before — this is a catalogue, not a
 * second store.
 */

export interface FilterOption {
  /** The value stored in the URL, and matched by `filterTodos`. */
  value: string;
  label: string;
}

export interface FilterOptionContext {
  columns: IColumn[];
  members: BoardMember[];
  currentUserId?: string;
}

/**
 * The options for one category, in the order they should be offered.
 *
 * The pseudo-values come first everywhere they exist. "Assigned to me" and
 * "Unassigned" are the two an assignee filter is asked for most, and burying
 * them under a roster would be the panel's own version of the problem it exists
 * to fix.
 */
export function filterOptions(
  category: FilterCategory,
  { columns, members, currentUserId }: FilterOptionContext,
): FilterOption[] {
  switch (category) {
    case "assignee":
      return [
        { value: ME, label: "Assigned to me" },
        { value: UNSET, label: "Unassigned" },
        // The signed-in user is offered once, as "Assigned to me". Listing them
        // again by name would be two checkboxes for one person that have to be
        // kept in agreement — and the roster row is the redundant one, since a
        // shared URL is meant to mean "assigned to whoever opened it".
        ...members
          .filter((member) => member.id !== currentUserId)
          .map((member) => ({ value: member.id, label: memberName(member) })),
      ];

    case "status":
      // Board order, so the panel lists columns as the board shows them.
      return columns
        .slice()
        .sort(byRank)
        .map((column) => ({
          value: column.id,
          label: columnTitle(column.title) || "Untitled",
        }));

    case "type":
      return WORK_TYPE_OPTIONS.map((type) => ({ value: type, label: type }));

    case "priority":
      return [
        ...PRIORITY_OPTIONS.map((priority) => ({
          value: priority,
          label: PRIORITIES[priority].label,
        })),
        { value: UNSET, label: "No priority" },
      ];

    case "due":
      return DUE_BUCKETS.map((bucket) => ({
        value: bucket,
        label: DUE_LABELS[bucket],
      }));
  }
}

/**
 * The options whose label matches a within-field query.
 *
 * Returns the input array when the query is empty, so an unsearched list hands
 * the same reference back — the rule `filterTodos` and `searchTodos` follow.
 *
 * Whitespace collapses so `john  smith` matches `John Smith`, which is the same
 * normalisation `searchTodos` applies to a board query. Two search boxes on one
 * screen behaving differently is worse than either behaving imperfectly.
 */
export function matchOptions(
  options: FilterOption[],
  query: string,
): FilterOption[] {
  const needle = query.trim().replace(/\s+/g, " ").toLowerCase();

  if (!needle) return options;

  return options.filter((option) =>
    option.label.trim().replace(/\s+/g, " ").toLowerCase().includes(needle),
  );
}

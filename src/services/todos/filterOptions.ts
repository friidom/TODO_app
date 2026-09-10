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

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterOptionContext {
  columns: IColumn[];
  members: BoardMember[];
  currentUserId?: string;
}

export function filterOptions(
  category: FilterCategory,
  { columns, members, currentUserId }: FilterOptionContext,
): FilterOption[] {
  switch (category) {
    case "assignee":
      return [
        { value: ME, label: "Assigned to me" },
        { value: UNSET, label: "Unassigned" },
        // exclude self — already covered by "Assigned to me" above
        ...members
          .filter((member) => member.id !== currentUserId)
          .map((member) => ({ value: member.id, label: memberName(member) })),
      ];

    case "status":
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

// returns the same array reference when the query is empty, matching filterTodos/searchTodos's convention
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

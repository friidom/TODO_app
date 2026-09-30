import i18n from "@/components/i18n";
import { PRIORITIES, PRIORITY_OPTIONS } from "@/constants/priorities";
import { WORK_TYPE_LABELS, WORK_TYPE_OPTIONS } from "@/constants/workTypes";
import { memberName } from "@/components/members/memberLabels";
import type { BoardMember } from "@/services/members/membersApi";
import type { IStatus } from "@/types/data";
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
  // Board order.
  statuses: IStatus[];
  members: BoardMember[];
  currentUserId?: string;
}

export function filterOptions(
  category: FilterCategory,
  { statuses, members, currentUserId }: FilterOptionContext,
): FilterOption[] {
  switch (category) {
    case "assignee":
      return [
        { value: ME, label: i18n.t("members.assignedToMe") },
        { value: UNSET, label: i18n.t("members.unassigned") },
        // exclude self — already covered by "Assigned to me" above
        ...members
          .filter((member) => member.id !== currentUserId)
          .map((member) => ({ value: member.id, label: memberName(member) })),
      ];

    // Hidden statuses included: cards already in one are still findable.
    case "status":
      return statuses.map((status) => ({
        value: status.id,
        label: status.name,
      }));

    case "type":
      return WORK_TYPE_OPTIONS.map((type) => ({
        value: type,
        label: WORK_TYPE_LABELS[type],
      }));

    case "priority":
      return [
        ...PRIORITY_OPTIONS.map((priority) => ({
          value: priority,
          label: PRIORITIES[priority].label,
        })),
        { value: UNSET, label: i18n.t("priority.none") },
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

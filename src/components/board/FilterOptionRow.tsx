import { CheckIcon } from "lucide-react";

import MemberIdentity from "@/components/members/MemberIdentity";
import { categoryOf } from "@/constants/columns";
import { PRIORITIES, toPriority } from "@/constants/priorities";
import { workTypeOf } from "@/constants/workTypes";
import type { BoardMember } from "@/services/members/membersApi";
import type { FilterOption } from "@/services/todos/filterOptions";
import { UNSET, type FilterCategory } from "@/services/todos/view";
import type { IStatus } from "@/types/data";
import { cn } from "@/utils/cn";

// MENU_ITEM's geometry without its `[&_svg]:text-ink-3`, which would outrank the work-type and priority icon tones
const ROW =
  "rounded-control text-meta coarse:py-2.5 hover:bg-wash-strong focus-visible:bg-wash-strong flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors duration-150 outline-none select-none";

// icon lookup lives here, not in filterOptions, so that module stays pure data
export default function FilterOptionRow({
  option,
  category,
  members,
  statuses,
  checked,
  onToggle,
  autoFocus,
}: {
  option: FilterOption;
  category: FilterCategory;
  members: BoardMember[];
  statuses: IStatus[];
  checked: boolean;
  onToggle: () => void;
  autoFocus?: boolean;
}) {
  const member =
    category === "assignee"
      ? members.find((it) => it.id === option.value)
      : undefined;

  const status =
    category === "status"
      ? statuses.find((it) => it.id === option.value)
      : undefined;

  const workType = category === "type" ? workTypeOf(option.value) : undefined;
  const WorkTypeIcon = workType?.icon;

  const priority =
    category === "priority" && option.value !== UNSET
      ? PRIORITIES[toPriority(option.value)!]
      : undefined;
  const PriorityIcon = priority?.icon;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      autoFocus={autoFocus}
      className={cn(ROW, checked ? "text-ink" : "text-ink-2 hover:text-ink")}
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors",
          checked
            ? "border-brand bg-brand text-brand-fg"
            : "border-ink/25 text-transparent",
        )}
      >
        <CheckIcon className="size-3" strokeWidth={3} />
      </span>

      {member ? (
        <span className="flex min-w-0 items-center gap-2">
          <MemberIdentity member={member} size="sm" />
        </span>
      ) : (
        <>
          {status && (
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                categoryOf(status.category).dot,
              )}
            />
          )}

          {WorkTypeIcon && (
            <WorkTypeIcon className={cn("size-3.5 shrink-0", workType.tone)} />
          )}

          {PriorityIcon && (
            <PriorityIcon className={cn("size-3.5 shrink-0", priority.tone)} />
          )}

          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              category === "due" &&
                option.value === "overdue" &&
                "text-status-red",
            )}
          >
            {option.label}
          </span>
        </>
      )}
    </button>
  );
}

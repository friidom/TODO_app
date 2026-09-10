import { useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import { CheckIcon, ListFilterIcon, SearchIcon } from "lucide-react";

import MemberIdentity from "@/components/members/MemberIdentity";
import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import { categoryOf } from "@/constants/columns";
import { PRIORITIES, toPriority } from "@/constants/priorities";
import { workTypeOf } from "@/constants/workTypes";
import { useBoardId } from "@/hooks/useBoardId";
import type { BoardView } from "@/hooks/useBoardView";
import { useAuth } from "@/services/auth/useAuth";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import {
  filterOptions,
  matchOptions,
  type FilterOption,
} from "@/services/todos/filterOptions";
import {
  FILTER_CATEGORIES,
  FILTER_LABELS,
  UNSET,
  type FilterCategory,
} from "@/services/todos/view";
import { cn } from "@/utils/cn";
import {
  HEADER_CONTROL,
  HEADER_CONTROL_ACTIVE,
  HEADER_CONTROL_BADGE,
} from "./headerControl";

const SEARCHABLE_FROM = 7;

// popover, not DropdownMenu — Base UI's Menu roving-tabindex/typeahead would eat keystrokes meant for the search input
export default function BoardFilters({ view }: { view: BoardView }) {
  const boardId = useBoardId();
  const { user } = useAuth();
  const { data: columns = [] } = useColumns();
  const { data: members = [] } = useBoardMembers(boardId);

  const { filters, filterCount, toggleFilter, clearFilters, clearCategory } =
    view;

  const { open, mounted, close, triggerProps, panelProps } = useCardPopover();

  const [field, setField] = useState<FilterCategory>("assignee");
  const [needle, setNeedle] = useState("");

  const options = filterOptions(field, {
    columns,
    members,
    currentUserId: user?.id,
  });

  const searchable = options.length >= SEARCHABLE_FROM;
  const shown = searchable ? matchOptions(options, needle) : options;

  function pickField(next: FilterCategory) {
    setField(next);
    setNeedle("");
  }

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        aria-label={filterCount ? `Filter — ${filterCount} active` : "Filter"}
        aria-expanded={open}
        className={cn(HEADER_CONTROL, filterCount > 0 && HEADER_CONTROL_ACTIVE)}
      >
        <ListFilterIcon className="size-4" />
        <span className="hidden md:inline">Filter</span>
        {filterCount > 0 && (
          <span className={HEADER_CONTROL_BADGE}>{filterCount}</span>
        )}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Filter"
            className="border-hairline bg-elevated rounded-card z-50 flex w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden border shadow-e3"
          >
            <div className="flex flex-col sm:flex-row">
              <div className="border-hairline shrink-0 border-b p-1.5 sm:w-44 sm:border-r sm:border-b-0">
                {FILTER_CATEGORIES.map((category) => {
                  const count = filters[category].length;
                  const selected = category === field;

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => pickField(category)}
                      className={cn(
                        "text-meta flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors",
                        selected
                          ? "bg-ink/[0.07] text-ink font-medium"
                          : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {FILTER_LABELS[category]}
                      </span>

                      {count > 0 && (
                        <span className="bg-brand text-brand-fg text-micro grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 font-semibold">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                {searchable && (
                  <div className="border-hairline flex items-center gap-2 border-b px-3 py-2">
                    <SearchIcon className="text-ink-3 size-3.5 shrink-0" />
                    <input
                      autoFocus
                      value={needle}
                      onChange={(e) => setNeedle(e.target.value)}
                      placeholder={`Search ${FILTER_LABELS[field].toLowerCase()}…`}
                      aria-label={`Search ${FILTER_LABELS[field]}`}
                      className="text-ink placeholder:text-ink-3 text-meta min-w-0 flex-1 bg-transparent outline-none"
                    />
                  </div>
                )}

                <div className="max-h-64 min-h-[8rem] overflow-y-auto p-1.5">
                  {shown.length === 0 ? (
                    <p className="text-ink-3 px-2 py-6 text-center text-xs">
                      Nothing matches “{needle.trim()}”.
                    </p>
                  ) : (
                    shown.map((option) => (
                      <OptionRow
                        key={option.value}
                        option={option}
                        field={field}
                        members={members}
                        columns={columns}
                        checked={filters[field].includes(option.value)}
                        onToggle={() => toggleFilter(field, option.value)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="border-hairline flex items-center gap-2 border-t px-3 py-2">
              <button
                type="button"
                onClick={clearFilters}
                disabled={filterCount === 0}
                className="text-ink-3 enabled:hover:text-ink text-xs transition-colors disabled:opacity-40"
              >
                Clear all
              </button>

              <button
                type="button"
                onClick={() => clearCategory(field)}
                disabled={filters[field].length === 0}
                className="text-ink-3 enabled:hover:text-ink ml-auto text-xs transition-colors disabled:opacity-40"
              >
                Clear {FILTER_LABELS[field].toLowerCase()}
              </button>

              <button
                type="button"
                onClick={close}
                className="bg-brand text-brand-fg hover:bg-brand/90 rounded-control px-2.5 py-1 text-xs font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// icon lookup lives here, not in filterOptions, so that module stays pure data
function OptionRow({
  option,
  field,
  members,
  columns,
  checked,
  onToggle,
}: {
  option: FilterOption;
  field: FilterCategory;
  members: ReturnType<typeof useBoardMembers>["data"] & object;
  columns: ReturnType<typeof useColumns>["data"] & object;
  checked: boolean;
  onToggle: () => void;
}) {
  const member =
    field === "assignee"
      ? members.find((it) => it.id === option.value)
      : undefined;

  const column =
    field === "status"
      ? columns.find((it) => it.id === option.value)
      : undefined;

  const workType = field === "type" ? workTypeOf(option.value) : undefined;
  const WorkTypeIcon = workType?.icon;

  const priority =
    field === "priority" && option.value !== UNSET
      ? PRIORITIES[toPriority(option.value)!]
      : undefined;
  const PriorityIcon = priority?.icon;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        "text-meta flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors",
        checked ? "bg-brand-soft text-ink" : "text-ink-2 hover:bg-ink/[0.04]",
      )}
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
          {column && (
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                categoryOf(column.category).dot,
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
              field === "due" &&
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

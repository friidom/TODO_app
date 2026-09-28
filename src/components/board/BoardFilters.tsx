import { useEffect, useRef, useState } from "react";
import { FloatingPortal, useMergeRefs } from "@floating-ui/react";
import { CheckIcon, ListFilterIcon, SearchIcon } from "lucide-react";

import MemberIdentity from "@/components/members/MemberIdentity";
import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import { MENU_LABEL, POPOVER_PANEL } from "@/components/ui/controlChrome";
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
import { HEADER_CONTROL_BADGE } from "./headerControl";
import ToolbarButton from "./ToolbarButton";

const SEARCHABLE_FROM = 7;

// MENU_ITEM's geometry without its `[&_svg]:text-ink-3`, which would outrank the work-type and priority icon tones
const ROW =
  "rounded-control text-meta coarse:py-2.5 hover:bg-wash-strong focus-visible:bg-wash-strong flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors duration-150 outline-none select-none";

const FOOTER_BUTTON =
  "rounded-control text-meta focus-visible:ring-brand h-7 px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2";

// popover, not DropdownMenu — Base UI's Menu roving-tabindex/typeahead would eat keystrokes meant for the search input
export default function BoardFilters({ view }: { view: BoardView }) {
  const boardId = useBoardId();
  const { user } = useAuth();
  const { data: columns = [] } = useColumns();
  const { data: members = [] } = useBoardMembers(boardId);

  const { filters, filterCount, toggleFilter, clearFilters, clearCategory } =
    view;

  const { open, mounted, close, triggerProps, panelProps } = useCardPopover({
    placement: "bottom-start",
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerMergedRef = useMergeRefs<HTMLButtonElement>([
    triggerProps.ref,
    triggerRef,
  ]);
  const panelMergedRef = useMergeRefs<HTMLDivElement>([
    panelProps.ref,
    panelRef,
  ]);

  // the panel is portalled to the end of <body>, so a keyboard user closing it would otherwise lose their place
  useEffect(() => {
    if (open) return;

    if (panelRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus();
    }
  }, [open]);

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
      <ToolbarButton
        {...triggerProps}
        ref={triggerMergedRef}
        label={filterCount ? `Filter — ${filterCount} active` : "Filter"}
        text="Filter"
        collapse="hidden @4xl:inline"
        icon={<ListFilterIcon className="size-4" />}
        active={filterCount > 0}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {filterCount > 0 && (
          <span className={HEADER_CONTROL_BADGE}>{filterCount}</span>
        )}
      </ToolbarButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            ref={panelMergedRef}
            role="dialog"
            aria-label="Filter"
            className={cn(
              POPOVER_PANEL,
              "z-50 flex w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden p-0",
            )}
          >
            <div className="flex flex-col sm:flex-row">
              <div className="border-hairline shrink-0 border-b p-1 sm:w-44 sm:border-r sm:border-b-0">
                <p className={MENU_LABEL}>Filter by</p>

                {FILTER_CATEGORIES.map((category) => {
                  const count = filters[category].length;
                  const selected = category === field;

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => pickField(category)}
                      aria-pressed={selected}
                      autoFocus={selected && !searchable}
                      className={cn(
                        ROW,
                        selected
                          ? "bg-brand-soft text-brand hover:bg-brand-soft font-medium"
                          : "text-ink-2 hover:text-ink",
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

                <div className="max-h-64 min-h-32 overflow-y-auto p-1">
                  {shown.length === 0 ? (
                    <p className="text-ink-3 text-meta px-2 py-6 text-center">
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

            <div className="border-hairline flex items-center gap-1 border-t p-1.5">
              <button
                type="button"
                onClick={clearFilters}
                disabled={filterCount === 0}
                className={cn(
                  FOOTER_BUTTON,
                  "text-ink-3 enabled:hover:bg-wash-strong enabled:hover:text-ink disabled:opacity-40",
                )}
              >
                Clear all
              </button>

              <button
                type="button"
                onClick={() => clearCategory(field)}
                disabled={filters[field].length === 0}
                className={cn(
                  FOOTER_BUTTON,
                  "text-ink-3 enabled:hover:bg-wash-strong enabled:hover:text-ink ml-auto disabled:opacity-40",
                )}
              >
                Clear {FILTER_LABELS[field].toLowerCase()}
              </button>

              <button
                type="button"
                onClick={close}
                className={cn(
                  FOOTER_BUTTON,
                  "bg-brand text-brand-fg hover:bg-brand/90 active:bg-brand/80 focus-visible:ring-offset-elevated px-3 focus-visible:ring-offset-2",
                )}
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

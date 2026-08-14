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

/** Past this many rows a list is worth searching; below it, a box is noise. */
const SEARCHABLE_FROM = 7;

/**
 * Narrow the board to the work you care about.
 *
 * **Two panes: the field on the left, its values on the right.** It used to be
 * all five categories stacked in one scrolling menu, which is fine at four
 * members and unusable at twenty — reaching "Priority" meant scrolling past
 * every person on the board. Picking the field first is what makes the panel a
 * fixed size whatever the roster does.
 *
 * **Not a `DropdownMenu`, and that is not a style choice.** Base UI's `Menu`
 * owns focus with a roving tabindex and a typeahead, so a text input inside a
 * `Menu.Popup` has its keystrokes intercepted and focus pulled onto whichever
 * item matched. The within-field search needs a real input, so the panel is a
 * plain popover on `useCardPopover` — the same primitive every card control
 * uses, which already brings outside-click, Escape, portalling and the
 * pointerdown guard.
 *
 * **The filter model is untouched.** Five dimensions, all fields the schema
 * already has; **AND between sections, OR inside one**; an empty section is
 * off rather than excluding everything; state lives in the URL through
 * `useBoardView`. This is a new way to reach `toggleFilter`, not a new store.
 *
 * Which options exist and what they are called is `filterOptions` — pure and
 * tested, because the within-field search runs over labels. Icons and tones are
 * read here from the constants that already hold them, so the pure module stays
 * free of React.
 */
export default function BoardFilters({ view }: { view: BoardView }) {
  const boardId = useBoardId();
  const { user } = useAuth();
  const { data: columns = [] } = useColumns();
  const { data: members = [] } = useBoardMembers(boardId);

  const { filters, filterCount, toggleFilter, clearFilters, clearCategory } =
    view;

  const { open, mounted, transitionStyles, close, triggerProps, panelProps } =
    useCardPopover();

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
    // The query belonged to the field that is leaving. Carrying "joh" into
    // Priority would show an empty list and look broken.
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

      {/* `mounted` rather than `open`: it stays true for the length of the close,
          which is what lets the panel animate out instead of vanishing on the
          frame the click lands. */}
      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Filter"
            // The positioning styles and the transition are merged rather than
            // fighting: `floatingStyles` owns where the panel is,
            // `transitionStyles` owns its opacity and transform, and the origin
            // inside them points back at the Filter button.
            style={{ ...panelProps.style, ...transitionStyles }}
            className="border-hairline bg-elevated rounded-card z-50 flex w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden border shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
          >
            {/* Stacks below `sm`, so the panel is still usable at 375px where
                two 15rem columns would each be too narrow to read. */}
            <div className="flex flex-col sm:flex-row">
              {/* LEFT — the fields, with what each one is holding. */}
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
                        "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] transition-colors",
                        selected
                          ? "bg-ink/[0.07] text-ink font-medium"
                          : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {FILTER_LABELS[category]}
                      </span>

                      {count > 0 && (
                        <span className="bg-brand text-brand-fg grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 text-[10px] font-semibold">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* RIGHT — the values of the field on the left. */}
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
                      className="text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
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

            {/* Two clears, and the difference matters: one empties the field you
                are looking at, the other empties every field. Each is offered
                only when it would do something. */}
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

/**
 * One value, with whatever the rest of the app already uses to picture it.
 *
 * The icon lookup lives here rather than in `filterOptions` so that module can
 * stay pure data — a member's avatar in particular needs the roster row, not
 * just a label.
 */
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
        "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] transition-colors",
        checked ? "bg-brand-soft text-ink" : "text-ink-2 hover:bg-ink/[0.04]",
      )}
    >
      {/* A box rather than a tick alone: an unchecked row needs to look
          checkable, and the column of empty boxes is what makes a multi-select
          list read as one. */}
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

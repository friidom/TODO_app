import { FloatingPortal } from "@floating-ui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Columns3Icon,
  LockIcon,
  RotateCcwIcon,
} from "lucide-react";

import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import {
  PINNED_COLUMN,
  isDefaultListColumns,
  offeredListColumns,
  type ListColumnId,
} from "@/services/views/listColumns";
import { useListColumns } from "@/stores/listColumns";
import { cn } from "@/utils/cn";
import { HEADER_CONTROL, HEADER_CONTROL_ACTIVE } from "./headerControl";

// A popover rather than DropdownMenu, for the reason BoardFilters gives: each row
// carries its own reorder buttons, and a roving-tabindex menu would swallow the
// keystrokes meant for them. Plain buttons keep the natural tab order instead.
export default function ListColumns() {
  const { open, mounted, triggerProps, panelProps } = useCardPopover();

  const sprintsEnabled = useSprintsEnabled();

  const columns = useListColumns((state) => state.columns);
  const toggle = useListColumns((state) => state.toggle);
  const swap = useListColumns((state) => state.swap);
  const reset = useListColumns((state) => state.reset);

  const offered = offeredListColumns({ sprintsEnabled });
  const shown = columns.filter((id) =>
    offered.some((column) => column.id === id),
  );

  // Visible first, in the order the table renders them, then the rest — so the
  // list doubles as the reordering surface.
  const rows = [
    ...shown,
    ...offered.map((column) => column.id).filter((id) => !shown.includes(id)),
  ];

  const customised = !isDefaultListColumns(shown);
  const last = shown[shown.length - 1];

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        aria-label={`Columns — ${shown.length} shown`}
        aria-expanded={open}
        className={cn(HEADER_CONTROL, customised && HEADER_CONTROL_ACTIVE)}
      >
        <Columns3Icon className="size-4" />
        <span className="hidden md:inline">Columns</span>
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label="Columns"
            className="border-hairline bg-elevated rounded-card shadow-e2 z-50 flex max-h-[70vh] w-64 flex-col border p-1"
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <p className="text-ink-3 text-mini flex-1 font-semibold tracking-wide uppercase">
                Columns
              </p>

              {customised && (
                <button
                  type="button"
                  onClick={reset}
                  className="text-ink-3 hover:text-ink text-mini flex items-center gap-1 rounded transition-colors"
                >
                  <RotateCcwIcon className="size-3" />
                  Reset
                </button>
              )}
            </div>

            {/* The menu is vertical and the table is horizontal, so say which
                way the order runs rather than leaving the arrows to imply it. */}
            <p className="text-ink-3/70 text-mini px-2 pb-1.5">
              Top to bottom here is left to right in the table.
            </p>

            <ul className="min-h-0 flex-1 overflow-y-auto">
              {rows.map((id) => (
                <ColumnRow
                  key={id}
                  id={id}
                  label={
                    offered.find((column) => column.id === id)?.label ?? id
                  }
                  visible={shown.includes(id)}
                  canMoveUp={shown.indexOf(id) > 1}
                  canMoveDown={shown.includes(id) && id !== last}
                  onToggle={() => toggle(id)}
                  // Neighbour resolved over the shown list, never the stored
                  // one, so a column the sprints flag hides is stepped over
                  // rather than swapped with invisibly.
                  onMove={(direction) => {
                    const neighbour = shown[shown.indexOf(id) + direction];

                    if (neighbour) swap(id, neighbour);
                  }}
                />
              ))}
            </ul>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function ColumnRow({
  id,
  label,
  visible,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMove,
}: {
  id: ListColumnId;
  label: string;
  visible: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const locked = id === PINNED_COLUMN;

  return (
    <li className="flex items-center gap-0.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={visible}
        aria-disabled={locked}
        onClick={locked ? undefined : onToggle}
        title={
          locked
            ? "The work item column always shows — it names the row"
            : undefined
        }
        className={cn(
          "rounded-control focus-visible:bg-ink/10 flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm transition-colors outline-none",
          locked ? "cursor-default" : "hover:bg-ink/10",
        )}
      >
        <span className="grid size-4 shrink-0 place-items-center">
          {visible && <CheckIcon className="text-brand size-4" />}
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            visible ? "text-ink" : "text-ink-3",
          )}
        >
          {label}
        </span>

        {locked && <LockIcon className="text-ink-3/60 size-3 shrink-0" />}
      </button>

      {!locked && visible && (
        <span className="flex shrink-0 items-center">
          <MoveButton
            label={`Move ${label} left`}
            icon={ChevronUpIcon}
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          />
          <MoveButton
            label={`Move ${label} right`}
            icon={ChevronDownIcon}
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          />
        </span>
      )}
    </li>
  );
}

function MoveButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof ChevronUpIcon;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="text-ink-3 hover:bg-ink/10 hover:text-ink focus-visible:ring-brand grid size-6 place-items-center rounded transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-25"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

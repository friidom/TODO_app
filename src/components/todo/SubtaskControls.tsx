import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import {
  CheckIcon,
  Columns3Icon,
  LockIcon,
  MoreHorizontalIcon,
  SearchIcon,
} from "lucide-react";

import { INLINE_ACTION_BRAND } from "./detailChrome";
import { OPTION_ITEM } from "./TodoItem/fieldChrome";
import { useCardPopover } from "./TodoItem/useCardPopover";
import { SearchField } from "@/components/board/FilterPopover";
import IconButton from "@/components/ui/IconButton";
import {
  MENU_LABEL,
  MENU_SEPARATOR,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { workTypeOf } from "@/constants/workTypes";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { matchOptions } from "@/services/todos/filterOptions";
import { subtaskCandidates } from "@/services/todos/subtasks";
import {
  SUBTASK_COLUMN_IDS,
  SUBTASK_COLUMN_LABELS,
  SUBTASK_SORTS,
  isDefaultSubtaskColumns,
  type SubtaskSort,
} from "@/services/todos/subtaskTable";
import { useTodos } from "@/services/todos/useTodos";
import { useUpdateTodo } from "@/services/todos/useUpdateTodo";
import { useSubtaskTable } from "@/stores/subtaskTable";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";

// Rendering more than this is a scroll through a board, not a pick — the search is how the rest is reached.
const MAX_ROWS = 50;

const NO_TODOS: Todo[] = [];

// The row's own onBlur has to let focus go into this popover without reading it as "left the row".
// onMouseDown keeps focus in the name field in browsers that do not focus a button on click.
export function ChooseExisting({
  parent,
  onPicked,
}: {
  parent: Todo;
  onPicked: () => void;
}) {
  const { t } = useTranslation();
  const { mounted, close, triggerProps, panelProps } = useCardPopover({
    placement: "bottom-start",
  });

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        onMouseDown={(event) => event.preventDefault()}
        aria-haspopup="dialog"
        className={cn(
          INLINE_ACTION_BRAND,
          "text-meta aria-expanded:bg-brand-soft flex items-center gap-1.5 px-1.5 py-1",
        )}
      >
        <SearchIcon className="size-4" />
        {t("subtasks.chooseExisting")}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={t("subtasks.chooseExisting")}
            className={cn(
              POPOVER_PANEL,
              "z-[70] flex max-h-80 w-80 max-w-[calc(100vw-1rem)] flex-col p-0",
            )}
          >
            <ExistingPicker
              parent={parent}
              onPick={() => {
                close();
                onPicked();
              }}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// Its own component so the search text lives exactly as long as the popover does.
function ExistingPicker({
  parent,
  onPick,
}: {
  parent: Todo;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  const { data: todos = NO_TODOS } = useTodos();
  const keyPrefix = useKeyPrefix();
  const update = useUpdateTodo();
  const [needle, setNeedle] = useState("");

  const options = useMemo(
    () =>
      subtaskCandidates(todos, parent).map((candidate) => ({
        value: candidate.id,
        label: [taskKey(keyPrefix, candidate.board_key), candidate.title]
          .filter(Boolean)
          .join(" "),
        candidate,
      })),
    [todos, parent, keyPrefix],
  );

  const shown = matchOptions(options, needle).slice(0, MAX_ROWS);

  function pick(candidate: Todo) {
    update.mutate({
      id: candidate.id,
      board_id: candidate.board_id,
      parent_id: parent.id,
      // The database refuses a subtask that carries a sprint of its own: it rides with its parent's.
      ...(candidate.sprint_id !== null && { sprint_id: null }),
    });
    onPick();
  }

  return (
    <>
      <div className="shrink-0 p-2">
        <SearchField
          value={needle}
          onChange={setNeedle}
          placeholder={t("subtasks.searchExisting")}
          label={t("subtasks.searchExisting")}
        />
      </div>

      <div className="min-h-0 overflow-y-auto px-1.5 pb-1.5">
        {options.length === 0 ? (
          <p className="text-ink-3 text-meta px-2 py-4 text-center">
            {t("subtasks.noCandidates")}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-ink-3 text-meta px-2 py-4 text-center">
            {t("common.nothingMatches", { query: needle.trim() })}
          </p>
        ) : (
          <ul>
            {shown.map(({ candidate }) => {
              const workType = workTypeOf(candidate.type);
              const WorkTypeIcon = workType.icon;
              const key = taskKey(keyPrefix, candidate.board_key);

              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => pick(candidate)}
                    className={cn(OPTION_ITEM, "min-w-0")}
                  >
                    <WorkTypeIcon
                      className={cn("size-4 shrink-0", workType.tone)}
                    />

                    {key && (
                      <span className="text-ink-3 text-mini shrink-0 tabular-nums">
                        {key}
                      </span>
                    )}

                    <span className="min-w-0 flex-1 truncate">
                      {candidate.title || t("common.untitled")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Box({ checked }: { checked: boolean }) {
  return (
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
  );
}

// Hide done and the sort order — the two things Jira keeps behind the section's ⋯.
export function SubtaskOptionsMenu() {
  const { t } = useTranslation();
  const { mounted, close, triggerProps, panelProps } = useCardPopover();

  const hideDone = useSubtaskTable((state) => state.prefs.hideDone);
  const sort = useSubtaskTable((state) => state.prefs.sort);
  const setHideDone = useSubtaskTable((state) => state.setHideDone);
  const setSort = useSubtaskTable((state) => state.setSort);

  const sortLabels: Record<SubtaskSort, string> = {
    created: t("fields.created"),
    priority: t("fields.priority"),
    status: t("fields.status"),
  };

  return (
    <>
      <IconButton
        label={t("subtasks.actions")}
        aria-haspopup="menu"
        {...triggerProps}
      >
        <MoreHorizontalIcon />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={t("subtasks.actions")}
            className={cn(POPOVER_PANEL, "z-[70] w-52")}
          >
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={hideDone}
              // Portalled to the end of body, so Tab from the trigger would never reach it.
              autoFocus
              onClick={() => {
                setHideDone(!hideDone);
                close();
              }}
              className={OPTION_ITEM}
            >
              <Box checked={hideDone} />

              <span className="min-w-0 flex-1 truncate">
                {t("subtasks.hideDone")}
              </span>
            </button>

            <div className={MENU_SEPARATOR} />

            <p className={MENU_LABEL}>{t("subtasks.sortBy")}</p>

            {SUBTASK_SORTS.map((id) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={sort === id}
                onClick={() => {
                  setSort(id);
                  close();
                }}
                className={OPTION_ITEM}
              >
                <span className="grid size-4 shrink-0 place-items-center">
                  {sort === id && <CheckIcon className="text-brand size-4" />}
                </span>

                <span className="min-w-0 flex-1 truncate">
                  {sortLabels[id]}
                </span>
              </button>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// No search box, unlike Jira's: five optional columns do not need one, and the filter popover only searches from seven.
export function SubtaskColumnsMenu() {
  const { t } = useTranslation();
  const { mounted, triggerProps, panelProps } = useCardPopover();

  const columns = useSubtaskTable((state) => state.prefs.columns);
  const toggleColumn = useSubtaskTable((state) => state.toggleColumn);
  const resetColumns = useSubtaskTable((state) => state.resetColumns);

  const isDefault = isDefaultSubtaskColumns(columns);

  return (
    <>
      <IconButton
        label={t("board.configureColumns")}
        active={!isDefault}
        aria-haspopup="dialog"
        {...triggerProps}
      >
        <Columns3Icon />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={t("board.configureColumns")}
            className={cn(POPOVER_PANEL, "z-[70] w-64 p-0")}
          >
            <p className={cn(MENU_LABEL, "px-3 pt-2.5")}>{t("list.columns")}</p>

            <ul className="p-1.5">
              <li>
                <div
                  aria-disabled
                  title={t("list.lockedColumnHint")}
                  className={cn(OPTION_ITEM, "opacity-70")}
                >
                  <Box checked />

                  <span className="min-w-0 flex-1 truncate">
                    {t("fields.work")}
                  </span>

                  <LockIcon
                    aria-label={t("list.locked")}
                    className="text-ink-3/60 size-3 shrink-0"
                  />
                </div>
              </li>

              {SUBTASK_COLUMN_IDS.map((id) => {
                const shown = columns.includes(id);

                return (
                  <li key={id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={shown}
                      onClick={() => toggleColumn(id)}
                      className={OPTION_ITEM}
                    >
                      <Box checked={shown} />

                      <span className="min-w-0 flex-1 truncate">
                        {SUBTASK_COLUMN_LABELS[id]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="border-hairline flex h-9 items-center justify-between border-t px-2">
              <button
                type="button"
                onClick={resetColumns}
                disabled={isDefault}
                className="rounded-control text-meta focus-visible:ring-brand text-ink-2 enabled:hover:bg-wash-strong enabled:hover:text-ink disabled:text-ink-3 h-7 px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 disabled:opacity-50"
              >
                {t("subtasks.restoreDefaults")}
              </button>

              <span className="text-ink-3 text-mini pr-1 tabular-nums">
                {t("list.visibleOf", {
                  visible: columns.length + 1,
                  total: SUBTASK_COLUMN_IDS.length + 1,
                })}
              </span>
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

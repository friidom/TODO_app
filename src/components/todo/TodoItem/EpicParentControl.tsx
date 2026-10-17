import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, LinkIcon, Link2OffIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { SearchField } from "@/components/board/FilterPopover";
import { Skeleton } from "@/components/ui/skeleton";
import { workTypeOf } from "@/constants/workTypes";
import { epicChoices, filterEpicChoices } from "@/services/todos/epicChoices";
import { useEpics } from "@/services/todos/useSubtasks";
import { useTodos } from "@/services/todos/useTodos";
import { useStatuses } from "@/services/workflow/useWorkflow";
import type { IStatus, Todo } from "@/types/data";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { taskKey } from "@/utils/taskKey";
import {
  MENU_ITEM,
  MENU_LABEL,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { cn } from "@/utils/cn";
import {
  FIELD_CELL,
  FIELD_CHIP,
  FIELD_EMPTY,
  OPTION_ITEM,
} from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

const EPIC = workTypeOf("Epic");
const NO_TODOS: Todo[] = [];
const NO_STATUSES: IStatus[] = [];

// list is exactly the board's Epics — anything else would be refused by enforce_work_item_hierarchy anyway
export default function EpicParentControl({
  value: epicId,
  onChange,
  variant,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  variant?: "cell";
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();
  const { epics } = useEpics();
  const { t } = useTranslation();
  const keyPrefix = useKeyPrefix();

  const epic = epics.find((candidate) => candidate.id === epicId) ?? null;
  const key = epic ? taskKey(keyPrefix, epic.board_key) : null;

  const label = epic
    ? t("epicParent.parent", {
        name: key ?? epic.title ?? t("activity.anEpic"),
      })
    : t("epicParent.none");

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={label}
        aria-label={label}
        className={
          variant === "cell"
            ? cn(FIELD_CELL, !epic && "text-ink-3")
            : cn(
                FIELD_CHIP,
                "min-w-0 shrink",
                epic
                  ? "bg-status-orange/15 text-status-orange hover:bg-status-orange/25"
                  : FIELD_EMPTY,
              )
        }
      >
        {variant === "cell" ? (
          epic ? (
            <>
              {key && <span className="text-ink-3 shrink-0">{key}</span>}
              <span className="min-w-0 truncate">
                {epic.title || t("common.untitled")}
              </span>
            </>
          ) : (
            t("common.none")
          )
        ) : (
          <>
            <LinkIcon className="size-3 shrink-0" />
            <span className="min-w-0 truncate">
              {epic
                ? (key ?? epic.title ?? t("common.untitled"))
                : t("common.none")}
            </span>
          </>
        )}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={t("epicParent.label")}
            className={cn(
              POPOVER_PANEL,
              "z-50 flex max-h-80 w-72 flex-col p-0",
            )}
          >
            <EpicPicker
              epicId={epicId}
              onPick={(next) => {
                onChange(next);
                close();
              }}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

const SHOWN = 50;

// Its own component so the search text and the toggle live exactly as long as the panel.
function EpicPicker({
  epicId,
  onPick,
}: {
  epicId: string | null;
  onPick: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const keyPrefix = useKeyPrefix();
  const { data: todos = NO_TODOS, isPending, error } = useTodos();
  const { data: statuses = NO_STATUSES } = useStatuses();
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);

  const choices = useMemo(
    () => epicChoices(todos, statuses, keyPrefix),
    [todos, statuses, keyPrefix],
  );
  const anyDone = choices.some((choice) => choice.isDone);
  const shown = filterEpicChoices(choices, {
    query,
    showDone,
    selectedId: epicId,
  });

  return (
    <>
      <div className="border-hairline space-y-2 border-b p-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t("subtasks.searchExisting")}
          label={t("subtasks.searchExisting")}
        />

        {anyDone && (
          <label className="text-ink-2 text-mini flex cursor-pointer items-center gap-2 px-0.5">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(event) => setShowDone(event.target.checked)}
              className="accent-brand size-3.5"
            />
            {t("epicParent.showDone")}
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <p className={MENU_LABEL}>{t("workType.epic")}</p>

        {isPending ? (
          <div className="space-y-1 p-1" aria-busy>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : error ? (
          <p role="alert" className="text-status-red text-meta px-2 py-2">
            {error.message}
          </p>
        ) : choices.length === 0 ? (
          <p className="text-ink-3 text-meta px-2 py-2">
            {t("epicParent.noEpics")}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-ink-3 text-meta px-2 py-2">
            {t("epicParent.noMatches")}
          </p>
        ) : (
          <ul>
            {shown.slice(0, SHOWN).map(({ epic, key, done, total }) => {
              const selected = epic.id === epicId;

              return (
                <li key={epic.id}>
                  <button
                    type="button"
                    aria-current={selected || undefined}
                    onClick={() => onPick(selected ? null : epic.id)}
                    className={cn(OPTION_ITEM, "min-w-0")}
                  >
                    <EPIC.icon className={cn("size-4", EPIC.tone)} />
                    <span className="min-w-0 flex-1 truncate">
                      {key && (
                        <span className="text-ink-3 tabular-nums">{key} </span>
                      )}
                      {epic.title || t("common.untitled")}
                    </span>
                    {total > 0 && (
                      <span className="text-ink-3 text-mini shrink-0 tabular-nums">
                        {done}/{total}
                      </span>
                    )}
                    {selected && <CheckIcon className="text-brand size-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {shown.length > SHOWN && (
          <p className="text-ink-3 text-mini px-2 py-1.5">
            {t("epicParent.refine", { count: SHOWN })}
          </p>
        )}
      </div>

      {epicId !== null && (
        <div className="border-hairline border-t p-1">
          <button
            type="button"
            onClick={() => onPick(null)}
            className={MENU_ITEM}
          >
            <Link2OffIcon />
            {t("epicParent.remove")}
          </button>
        </div>
      )}
    </>
  );
}

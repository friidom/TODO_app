import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FloatingPortal } from "@floating-ui/react";
import { CheckIcon, PlusIcon } from "lucide-react";

import LabelChip from "@/components/todo/LabelChip";
import {
  MENU_LABEL,
  MENU_SEPARATOR,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import {
  MAX_LABELS,
  MAX_LABEL_LENGTH,
  hasLabel,
  labelCatalog,
  labelTone,
  labelsOf,
  normalizeLabel,
} from "@/services/todos/labels";
import { useLabelChange } from "@/services/todos/useLabels";
import { useTodos } from "@/services/todos/useTodos";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { FIELD_EMPTY, FIELD_ROW, OPTION_ITEM } from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

const SHOWN = 50;
const NO_TODOS: Todo[] = [];

export default function LabelsControl({
  todo,
  editable,
}: {
  todo: Pick<Todo, "id" | "board_key" | "labels">;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const change = useLabelChange(todo.id);
  const labels = labelsOf(todo);
  const pending = todo.board_key === null;

  const remove = (name: string) => change.mutate({ name, on: false });

  return (
    <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-1 py-0.5">
      {labels.map((name) => (
        <LabelChip
          key={name}
          name={name}
          onRemove={editable ? () => remove(name) : undefined}
          removeLabel={t("labels.remove", { name })}
        />
      ))}

      {editable && (
        <LabelPicker
          labels={labels}
          disabled={pending}
          onChange={(name, on) => change.mutate({ name, on })}
          empty={labels.length === 0}
        />
      )}

      {!editable && labels.length === 0 && (
        <span className="text-ink-3 text-meta">{t("common.none")}</span>
      )}
    </div>
  );
}

function LabelPicker({
  labels,
  disabled,
  empty,
  onChange,
}: {
  labels: string[];
  disabled: boolean;
  empty: boolean;
  onChange: (name: string, on: boolean) => void;
}) {
  const { t } = useTranslation();
  const { mounted, triggerProps, panelProps } = useCardPopover({
    placement: "bottom-start",
  });

  const label = disabled ? t("labels.inFlight") : t("labels.add");

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        className={cn(
          empty
            ? cn(FIELD_ROW, "text-ink-3 mx-0")
            : cn(FIELD_EMPTY, "rounded-control grid size-6 place-items-center"),
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <PlusIcon className="size-3.5" />
        {empty && <span>{t("labels.add")}</span>}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={t("labels.add")}
            className={cn(POPOVER_PANEL, "z-50 w-64 p-0")}
          >
            <PickerBody labels={labels} onChange={onChange} />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// Its own component so the typed text lives exactly as long as the panel.
function PickerBody({
  labels,
  onChange,
}: {
  labels: string[];
  onChange: (name: string, on: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: todos = NO_TODOS } = useTodos();
  const [text, setText] = useState("");

  const catalog = useMemo(() => {
    const used = labelCatalog(todos);

    // a label on this card that the list cache has not caught up with yet still shows as checked
    for (const name of labels) {
      if (
        !hasLabel(
          used.map((use) => use.name),
          name,
        )
      ) {
        used.push({ name, count: 1 });
      }
    }

    return used;
  }, [todos, labels]);

  const typed = normalizeLabel(text);
  const needle = typed.toLowerCase();
  const matches = needle
    ? catalog.filter((use) => use.name.toLowerCase().includes(needle))
    : catalog;
  const exact = catalog.find((use) => use.name.toLowerCase() === needle);

  const full = labels.length >= MAX_LABELS;
  const tooLong = typed.length > MAX_LABEL_LENGTH;
  const canCreate = typed.length > 0 && !exact && !tooLong && !full;

  function toggle(name: string) {
    const on = !hasLabel(labels, name);

    if (on && full) return;

    onChange(name, on);
  }

  function create() {
    if (!canCreate) return;

    onChange(typed, true);
    setText("");
  }

  const problem = tooLong
    ? t("labels.tooLong")
    : full && typed && !exact
      ? t("labels.limit")
      : null;

  return (
    <div className="flex max-h-80 flex-col">
      <div className="border-hairline border-b p-2">
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (exact) toggle(exact.name);
              else create();
              if (exact) setText("");
            }

            if (event.key === "Backspace" && text === "" && labels.length > 0) {
              event.preventDefault();
              onChange(labels[labels.length - 1]!, false);
            }
          }}
          placeholder={t("labels.search")}
          aria-label={t("labels.search")}
          aria-invalid={tooLong || undefined}
          maxLength={MAX_LABEL_LENGTH + 20}
          className="border-ink/20 bg-surface rounded-control text-ink placeholder:text-ink-3 text-meta focus:border-brand focus:ring-brand/30 h-8 w-full border px-2.5 outline-none focus:ring-2"
        />

        {problem && (
          <p role="alert" className="text-status-red text-mini mt-1.5">
            {problem}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {canCreate && (
          <>
            <button type="button" onClick={create} className={OPTION_ITEM}>
              <PlusIcon className="text-ink-3" />
              <span className="min-w-0 truncate">
                {t("labels.create", { name: typed })}
              </span>
            </button>
            {matches.length > 0 && <div className={MENU_SEPARATOR} />}
          </>
        )}

        {catalog.length === 0 && !canCreate ? (
          <p className="text-ink-3 text-meta px-2 py-2">{t("labels.none")}</p>
        ) : matches.length === 0 && !canCreate ? (
          <p className="text-ink-3 text-meta px-2 py-2">
            {t("labels.noMatches", { query: typed })}
          </p>
        ) : (
          matches.length > 0 && (
            <>
              <p className={MENU_LABEL}>{t("labels.all")}</p>
              <ul>
                {matches.slice(0, SHOWN).map((use) => {
                  const checked = hasLabel(labels, use.name);

                  return (
                    <li key={use.name}>
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={checked}
                        disabled={!checked && full}
                        onClick={() => toggle(use.name)}
                        className={OPTION_ITEM}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded-sm border",
                            checked
                              ? "border-brand bg-brand text-brand-fg"
                              : "border-ink/25",
                          )}
                        >
                          {checked && <CheckIcon className="size-3" />}
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            labelTone(use.name).dot,
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {use.name}
                        </span>
                        <span className="text-ink-3 text-mini tabular-nums">
                          {use.count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )
        )}
      </div>
    </div>
  );
}

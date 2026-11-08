import { useTranslation } from "react-i18next";
import { useId, useRef, useState, type ReactNode } from "react";
import { FloatingPortal } from "@floating-ui/react";
import {
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarIcon,
  CalendarPlusIcon,
  CalendarSyncIcon,
  ChevronDownIcon,
  CircleDotIcon,
  FolderIcon,
  GaugeIcon,
  HashIcon,
  Loader2Icon,
  RotateCcwIcon,
  ListTreeIcon,
  ShapesIcon,
  SignalIcon,
  TagIcon,
  TextIcon,
  UserIcon,
  UserPenIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";

import { SECTION_TITLE } from "@/components/todo/detailChrome";
import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import IconButton from "@/components/ui/IconButton";
import { MENU_ITEM, POPOVER_PANEL } from "@/components/ui/controlChrome";
import { workTypeOf } from "@/constants/workTypes";
import { matchOptions } from "@/services/todos/filterOptions";
import {
  CARD_FIELD_LABELS,
  CARD_FIELDS,
  HIDE_DONE_DAYS,
  toggleCardField,
  type CardField,
  type ColumnSize,
  type HideDoneAfter,
  type ScrollMode,
} from "@/services/views/boardViewPrefs";
import { useBoardViewPrefs } from "@/hooks/useBoardViewPrefs";
import { usePermissions } from "@/hooks/usePermissions";
import { useSaveBoardView } from "@/hooks/useSaveBoardView";
import { cn } from "@/utils/cn";

const FIELD_ICONS: Record<CardField, LucideIcon> = {
  summary: TextIcon,
  key: HashIcon,
  type: ShapesIcon,
  priority: SignalIcon,
  estimate: GaugeIcon,
  due: CalendarIcon,
  subtasks: ListTreeIcon,
  assignee: UserIcon,
  parent: workTypeOf("Epic").icon,
  space: FolderIcon,
  status: CircleDotIcon,
  start: CalendarClockIcon,
  created: CalendarPlusIcon,
  updated: CalendarSyncIcon,
  resolved: CalendarCheckIcon,
  reporter: UserPenIcon,
  labels: TagIcon,
};

const HINT = "text-ink-3 text-meta leading-relaxed";

// The body of the ?panel=settings drawer. Every choice is per device (see boardViewPrefs) and applies to the Board view.
export default function ViewSettings() {
  const { t } = useTranslation();
  const {
    prefs: { columnSize, scroll, hideDoneAfter },
    setPrefs,
  } = useBoardViewPrefs();
  const hideDoneId = useId();

  return (
    <div className="space-y-8 p-5">
      <BoardViewState />

      <section className="space-y-2">
        <label htmlFor={hideDoneId} className={cn(SECTION_TITLE, "block")}>
          {t("viewSettings.hideDoneAfter")}
        </label>

        <div className="relative">
          <select
            id={hideDoneId}
            value={hideDoneAfter ?? ""}
            onChange={(event) =>
              setPrefs({
                hideDoneAfter:
                  event.target.value === ""
                    ? null
                    : (Number(event.target.value) as HideDoneAfter),
              })
            }
            className="border-ink/15 bg-surface text-ink hover:border-ink/25 focus:border-brand focus:ring-brand/30 rounded-control h-10 w-full cursor-pointer appearance-none border pr-9 pl-3 text-sm transition-colors duration-150 outline-none focus:ring-2 dark:scheme-dark"
          >
            <option value="">{t("viewSettings.never")}</option>

            {HIDE_DONE_DAYS.map((days) => (
              <option key={days} value={days}>
                {t("viewSettings.days", { count: days })}
              </option>
            ))}
          </select>

          <ChevronDownIcon
            aria-hidden
            className="text-ink-3 pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
          />
        </div>

        <p className={HINT}>{t("viewSettings.hideDoneHint")}</p>
      </section>

      <Setting
        title={t("viewSettings.columnSize")}
        hint={t("viewSettings.columnSizeHint")}
      >
        <Choices<ColumnSize>
          label={t("viewSettings.columnSize")}
          value={columnSize}
          onChange={(id) => setPrefs({ columnSize: id })}
          options={[
            { id: "fixed", label: t("viewSettings.fixed") },
            { id: "flexible", label: t("viewSettings.flexible") },
          ]}
          drawing={(id, selected) => (
            <SizeDrawing flexible={id === "flexible"} selected={selected} />
          )}
        />
      </Setting>

      <Setting
        title={t("viewSettings.scrolling")}
        hint={t("viewSettings.scrollingHint")}
      >
        <Choices<ScrollMode>
          label={t("viewSettings.scrolling")}
          value={scroll}
          onChange={(id) => setPrefs({ scroll: id })}
          options={[
            { id: "columns", label: t("viewSettings.withinColumns") },
            { id: "board", label: t("viewSettings.wholeBoard") },
          ]}
        />
      </Setting>

      <Setting
        title={t("viewSettings.showFields")}
        hint={t("viewSettings.showFieldsHint")}
      >
        <ShowFields />
      </Setting>

      <p className="border-hairline text-ink-3 text-mini border-t pt-4">
        {t("viewSettings.deviceNote")}
      </p>
    </div>
  );
}

// Personal versus saved: what this device shows, whether it differs from the board's saved view, and the two ways to
// settle that. Only admins may publish (PATCH /boards is admin-gated); anyone may drop their own changes.
function BoardViewState() {
  const { t } = useTranslation();
  const { boardId, prefs, dirty, saved, reset } = useBoardViewPrefs();
  const { canEditBoard } = usePermissions();
  const { save, isPending } = useSaveBoardView();

  const hint = dirty
    ? canEditBoard
      ? t("viewSettings.unsavedHintAdmin")
      : t("viewSettings.unsavedHintMember")
    : saved
      ? t("viewSettings.savedHint")
      : t("viewSettings.notSavedHint");

  return (
    <section
      aria-labelledby="board-view-state"
      className={cn(
        "rounded-card border p-3.5 transition-colors duration-150",
        dirty ? "border-brand/40 bg-brand-wash" : "border-hairline bg-surface",
      )}
    >
      <div className="flex items-center gap-2">
        <h3 id="board-view-state" className="text-ink text-sm font-semibold">
          {t("viewSettings.boardView")}
        </h3>

        <span
          className={cn(
            "text-micro rounded-full px-1.5 py-0.5 font-semibold tracking-wide uppercase",
            dirty
              ? "bg-brand-soft text-brand"
              : saved
                ? "bg-status-green/12 text-status-green"
                : "bg-wash-strong text-ink-2",
          )}
        >
          {dirty
            ? t("viewSettings.unsaved")
            : saved
              ? t("viewSettings.saved")
              : t("viewSettings.notSaved")}
        </span>
      </div>

      <p className={cn(HINT, "mt-1.5")}>{hint}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {canEditBoard && (
          <button
            type="button"
            disabled={!boardId || isPending || (!dirty && saved)}
            onClick={() => boardId && save(boardId, prefs)}
            className="bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand rounded-control inline-flex h-8 items-center gap-1.5 px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending && <Loader2Icon className="size-4 animate-spin" />}
            {t("viewSettings.saveBoard")}
          </button>
        )}

        <button
          type="button"
          disabled={!dirty}
          onClick={reset}
          className="border-ink/15 text-ink-2 hover:bg-brand-wash hover:text-ink focus-visible:ring-brand rounded-control inline-flex h-8 items-center gap-1.5 border px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <RotateCcwIcon className="size-4" />
          {t("viewSettings.resetToSaved")}
        </button>
      </div>
    </section>
  );
}

function Setting({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className={SECTION_TITLE}>{title}</h3>

        <p className={HINT}>{hint}</p>
      </div>

      {children}
    </section>
  );
}

// Two joined options, one always chosen: the chosen one's brand border sits on top of the shared edge.
function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
  drawing,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  drawing?: (id: T, selected: boolean) => ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="flex">
      {options.map(({ id, label: name }, index) => {
        const selected = value === id;

        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(id)}
            className={cn(
              "focus-visible:ring-brand flex min-w-0 flex-1 flex-col items-center justify-center gap-2 border px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:z-20 focus-visible:ring-2",
              drawing ? "py-3.5" : "h-10",
              index === 0 ? "rounded-l-card" : "rounded-r-card -ml-px",
              selected
                ? "border-brand bg-brand-soft text-brand relative z-10"
                : "border-ink/15 text-ink-2 hover:bg-wash-strong hover:text-ink",
            )}
          >
            {drawing?.(id, selected)}

            <span className="max-w-full truncate">{name}</span>
          </button>
        );
      })}
    </div>
  );
}

// Three bars in a frame: narrow with room left over when fixed, filling it when flexible.
function SizeDrawing({
  flexible,
  selected,
}: {
  flexible: boolean;
  selected: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-elevated flex h-9 w-16 items-stretch gap-1 rounded-md border p-1 transition-colors duration-150",
        selected ? "border-brand/50" : "border-ink/15",
      )}
    >
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className={cn(
            "rounded-sm transition-colors duration-150",
            selected ? "bg-brand/25" : "bg-wash-strong",
            flexible ? "flex-1" : "w-3 shrink-0",
          )}
        />
      ))}
    </span>
  );
}

// Fields offered by search and listed below it, both in label order, so each language reads alphabetically.
function ShowFields() {
  const { t } = useTranslation();
  const {
    prefs: { cardFields: shown },
    setPrefs,
  } = useBoardViewPrefs();

  const byLabel = (a: CardField, b: CardField) =>
    CARD_FIELD_LABELS[a].localeCompare(CARD_FIELD_LABELS[b]);

  const selected = CARD_FIELDS.filter((field) => shown.includes(field)).sort(
    byLabel,
  );
  const hidden = CARD_FIELDS.filter((field) => !shown.includes(field)).sort(
    byLabel,
  );

  function toggle(field: CardField) {
    setPrefs({ cardFields: toggleCardField(shown, field) });
  }

  return (
    <div className="space-y-4">
      <FieldSearch fields={hidden} onPick={toggle} />

      <div>
        <p className="text-ink text-meta mb-1.5 flex items-center gap-1.5 font-semibold">
          {t("viewSettings.selectedFields")}
          <span className="bg-wash-strong text-ink-2 text-micro rounded-full px-1.5 tabular-nums">
            {selected.length}/{CARD_FIELDS.length}
          </span>
        </p>

        {selected.length === 0 ? (
          <p className={HINT}>{t("viewSettings.noFieldsSelected")}</p>
        ) : (
          <ul className="-mx-1.5">
            {selected.map((field) => {
              const Icon = FIELD_ICONS[field];
              const name = CARD_FIELD_LABELS[field];

              return (
                <li
                  key={field}
                  className="group/field hover:bg-brand-wash focus-within:bg-brand-wash rounded-control animate-in fade-in-0 flex h-10 items-center gap-3 px-1.5 transition-colors duration-150"
                >
                  <span className="bg-wash-strong text-ink-2 group-hover/field:bg-brand-soft group-hover/field:text-brand grid size-7 shrink-0 place-items-center rounded-md transition-colors duration-150">
                    <Icon className="size-4" />
                  </span>

                  <span className="text-ink min-w-0 flex-1 truncate text-sm">
                    {name}
                  </span>

                  <IconButton
                    label={t("viewSettings.removeField", { name })}
                    onClick={() => toggle(field)}
                  >
                    <XIcon />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// A combobox over the hidden fields: typing narrows the list, picking one adds it to the card.
function FieldSearch({
  fields,
  onPick,
}: {
  fields: CardField[];
  onPick: (field: CardField) => void;
}) {
  const { t } = useTranslation();
  const [needle, setNeedle] = useState("");
  // as wide as the field it drops from, measured as it opens rather than read off the ref during render
  const [listWidth, setListWidth] = useState<number>();
  const input = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const { open, mounted, setOpen, triggerProps, panelProps } = useCardPopover({
    placement: "bottom-start",
  });

  const matches = matchOptions(
    fields.map((field) => ({ value: field, label: CARD_FIELD_LABELS[field] })),
    needle,
  );

  function openList() {
    setListWidth(input.current?.offsetWidth);
    setOpen(true);
  }

  function pick(field: CardField) {
    onPick(field);
    setNeedle("");
    setOpen(false);
    input.current?.focus();
  }

  function focusOption(step: number) {
    const options = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? [],
    );
    const at = options.indexOf(document.activeElement as HTMLButtonElement);

    options[Math.max(0, Math.min(options.length - 1, at + step))]?.focus();
  }

  return (
    <>
      <div className="relative">
        <input
          ref={(element) => {
            input.current = element;
            triggerProps.ref(element);
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={t("viewSettings.searchFields")}
          placeholder={t("viewSettings.searchFields")}
          value={needle}
          onChange={(event) => {
            setNeedle(event.target.value);
            openList();
          }}
          onClick={openList}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              openList();
              requestAnimationFrame(() => focusOption(0));
            }

            if (event.key === "Enter" && open && matches[0]) {
              event.preventDefault();
              pick(matches[0].value);
            }
          }}
          className="border-ink/15 bg-surface text-ink placeholder:text-ink-3 hover:border-ink/25 focus:border-brand focus:ring-brand/30 rounded-control h-10 w-full border pr-9 pl-3 text-sm transition-colors duration-150 outline-none focus:ring-2"
        />

        <ChevronDownIcon
          aria-hidden
          className={cn(
            "text-ink-3 pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </div>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            ref={(element) => {
              list.current = element;
              panelProps.ref(element);
            }}
            id={listId}
            role="listbox"
            aria-label={t("viewSettings.searchFields")}
            style={{ ...panelProps.style, width: listWidth }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                focusOption(event.key === "ArrowDown" ? 1 : -1);
              }
            }}
            className={cn(POPOVER_PANEL, "z-[60] max-h-64 overflow-y-auto")}
          >
            {matches.length === 0 ? (
              <p className="text-ink-3 text-meta px-2 py-3 text-center">
                {fields.length === 0
                  ? t("viewSettings.allFieldsShown")
                  : t("common.nothingMatches", { query: needle.trim() })}
              </p>
            ) : (
              matches.map((option) => {
                const Icon = FIELD_ICONS[option.value];

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => pick(option.value)}
                    className={MENU_ITEM}
                  >
                    <Icon />
                    {option.label}
                  </button>
                );
              })
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

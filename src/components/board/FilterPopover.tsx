import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FloatingPortal } from "@floating-ui/react";
import { ListFilterIcon, PlusIcon, SearchIcon } from "lucide-react";

import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import { MENU_ITEM, POPOVER_PANEL } from "@/components/ui/controlChrome";
import { useBoardId } from "@/hooks/useBoardId";
import type { BoardView } from "@/hooks/useBoardView";
import { useAuth } from "@/services/auth/useAuth";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import {
  filterOptions,
  matchOptions,
  type FilterOption,
} from "@/services/todos/filterOptions";
import {
  FILTER_CATEGORIES,
  FILTER_LABELS,
  type FilterCategory,
} from "@/services/todos/view";
import { useStatuses } from "@/services/workflow/useWorkflow";
import { cn } from "@/utils/cn";
import FilterOptionRow from "./FilterOptionRow";
import { HEADER_CONTROL_BADGE } from "./headerControl";
import ToolbarButton from "./ToolbarButton";
import { useFilterPopover } from "./useFilterPopover";

const SEARCHABLE_FROM = 7;

const PINNED: FilterCategory[] = ["assignee", "status", "type", "priority"];

const UNPINNED = FILTER_CATEGORIES.filter((field) => !PINNED.includes(field));

const FIELD =
  "text-meta coarse:h-10 focus-visible:ring-brand flex h-8 w-full shrink-0 items-center gap-2 border-l-2 pr-2 pl-2.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset";

const FOOTER =
  "border-hairline mt-auto flex h-9 shrink-0 items-center border-t";

const FOOTER_BUTTON =
  "rounded-control text-meta focus-visible:ring-brand text-ink-2 enabled:hover:bg-wash-strong enabled:hover:text-ink disabled:text-ink-3 h-7 px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 disabled:opacity-50";

// popover, not DropdownMenu — Base UI's Menu roving-tabindex/typeahead would eat keystrokes meant for the search inputs
export default function FilterPopover({
  view,
  collapse,
}: {
  view: BoardView;
  collapse?: string;
}) {
  const { t } = useTranslation();
  const { mounted, triggerProps, panelProps } = useFilterPopover();

  const count = view.filterCount;
  const name = t("toolbar.filter");

  return (
    <>
      <ToolbarButton
        {...triggerProps}
        label={count ? t("filter.active", { count }) : name}
        text={name}
        collapse={collapse}
        icon={<ListFilterIcon className="size-4" />}
        active={count > 0}
        aria-haspopup="dialog"
      >
        {count > 0 && <span className={HEADER_CONTROL_BADGE}>{count}</span>}
      </ToolbarButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={name}
            className={cn(
              POPOVER_PANEL,
              "z-50 flex max-h-[min(26rem,calc(100dvh-13rem))] w-[min(29rem,calc(100vw-1rem))] overflow-hidden p-0",
            )}
          >
            <FilterMenu view={view} />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// its own component so the open field and any added field live exactly as long as the panel does
function FilterMenu({ view }: { view: BoardView }) {
  const { t } = useTranslation();

  const [pane, setPane] = useState<FilterCategory>(
    () =>
      [...PINNED, ...UNPINNED].find(
        (field) => view.filters[field].length > 0,
      ) ?? PINNED[0],
  );
  const [added, setAdded] = useState<FilterCategory[]>([]);

  // an unpinned field disappears again once nothing keeps it — not added, not filtering, not open
  const extra = UNPINNED.filter(
    (field) =>
      added.includes(field) || view.filters[field].length > 0 || pane === field,
  );
  const addable = UNPINNED.filter((field) => !extra.includes(field));

  function fieldButton(field: FilterCategory) {
    const count = view.filters[field].length;
    const current = pane === field;

    return (
      <button
        key={field}
        type="button"
        onClick={() => setPane(field)}
        aria-current={current || undefined}
        className={cn(
          FIELD,
          current
            ? "border-brand bg-brand-soft text-brand font-medium"
            : "text-ink-2 hover:bg-wash-strong hover:text-ink border-transparent",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{FILTER_LABELS[field]}</span>
        {count > 0 && <span className={HEADER_CONTROL_BADGE}>{count}</span>}
      </button>
    );
  }

  return (
    <>
      <div className="border-hairline flex w-32 shrink-0 flex-col border-r sm:w-44">
        <nav
          aria-label={t("filter.fields")}
          className="flex min-h-0 flex-col overflow-y-auto p-1.5"
        >
          {PINNED.map(fieldButton)}

          {extra.length > 0 && (
            <div className="bg-hairline mx-1 my-1.5 h-px shrink-0" />
          )}
          {extra.map(fieldButton)}

          {addable.length > 0 && (
            <AddFieldMenu
              fields={addable}
              onAdd={(field) => {
                setAdded((previous) => [...previous, field]);
                setPane(field);
              }}
            />
          )}
        </nav>

        <div className={cn(FOOTER, "px-1.5")}>
          <button
            type="button"
            onClick={view.clearFilters}
            disabled={view.filterCount === 0}
            className={FOOTER_BUTTON}
          >
            {t("filter.clearAll")}
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <ValuePanel key={pane} view={view} category={pane} />
      </div>
    </>
  );
}

function ValuePanel({
  view,
  category,
}: {
  view: BoardView;
  category: FilterCategory;
}) {
  const { t } = useTranslation();
  const boardId = useBoardId();
  const { user } = useAuth();
  const { data: statuses = [] } = useStatuses();
  const { data: members = [] } = useBoardMembers(boardId);

  const [needle, setNeedle] = useState("");

  const selected = view.filters[category];
  const name = FILTER_LABELS[category];

  const options = filterOptions(category, {
    statuses,
    members,
    currentUserId: user?.id,
  });

  const searchable = options.length >= SEARCHABLE_FROM;
  const shown = searchable ? matchOptions(options, needle) : options;

  return (
    <>
      {searchable && (
        <div className="shrink-0 px-3 pt-3 pb-1">
          <SearchField
            value={needle}
            onChange={setNeedle}
            placeholder={t("filter.searchPlaceholder", { name })}
            label={t("filter.search", { name })}
          />
        </div>
      )}

      <div
        role="group"
        aria-label={t("filter.by", { name })}
        className="min-h-0 overflow-y-auto p-1.5"
      >
        {shown.length === 0 ? (
          <Nothing query={needle} />
        ) : (
          shown.map((option, index) => (
            <FilterOptionRow
              key={option.value}
              option={option}
              category={category}
              members={members}
              statuses={statuses}
              checked={selected.includes(option.value)}
              onToggle={() => view.toggleFilter(category, option.value)}
              autoFocus={!searchable && index === 0}
            />
          ))
        )}
      </div>

      <div className={cn(FOOTER, "justify-between px-1.5")}>
        <button
          type="button"
          onClick={() => view.clearCategory(category)}
          disabled={selected.length === 0}
          aria-label={t("filter.clearField", { name })}
          className={FOOTER_BUTTON}
        >
          {t("common.clear")}
        </button>

        {searchable && <Counter shown={shown} options={options} />}
      </div>
    </>
  );
}

function AddFieldMenu({
  fields,
  onAdd,
}: {
  fields: FilterCategory[];
  onAdd: (field: FilterCategory) => void;
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
        aria-haspopup="dialog"
        className="rounded-control text-meta border-ink/15 text-ink-2 hover:bg-wash-strong hover:text-ink aria-expanded:bg-wash-strong aria-expanded:text-ink focus-visible:ring-brand mt-2 ml-1 flex h-7 shrink-0 items-center gap-1.5 self-start border px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2"
      >
        <PlusIcon className="size-3.5" />
        {t("filter.addField")}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={t("filter.addField")}
            className={cn(
              POPOVER_PANEL,
              "z-[60] flex max-h-72 w-52 flex-col overflow-hidden p-0",
            )}
          >
            <FieldSearch
              fields={fields}
              onPick={(field) => {
                close();
                onAdd(field);
              }}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// its own component so the search text lives exactly as long as the menu does
function FieldSearch({
  fields,
  onPick,
}: {
  fields: FilterCategory[];
  onPick: (field: FilterCategory) => void;
}) {
  const { t } = useTranslation();
  const [needle, setNeedle] = useState("");

  const options = fields.map((field) => ({
    value: field,
    label: FILTER_LABELS[field],
  }));
  const shown = matchOptions(options, needle);

  return (
    <>
      <div className="shrink-0 p-2">
        <SearchField
          value={needle}
          onChange={setNeedle}
          placeholder={t("filter.searchFields")}
          label={t("filter.searchFields")}
        />
      </div>

      <div className="min-h-0 overflow-y-auto px-1.5 pb-1.5">
        {shown.length === 0 ? (
          <Nothing query={needle} />
        ) : (
          shown.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onPick(option.value)}
              className={MENU_ITEM}
            >
              {option.label}
            </button>
          ))
        )}
      </div>

      <div className="border-hairline flex h-8 shrink-0 items-center justify-end border-t px-3">
        <Counter shown={shown} options={options} />
      </div>
    </>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="border-ink/20 bg-surface rounded-control focus-within:border-brand focus-within:ring-brand/30 flex h-8 items-center gap-2 border px-2.5 transition-colors duration-150 focus-within:ring-2">
      <SearchIcon className="text-ink-3 size-3.5 shrink-0" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="text-ink placeholder:text-ink-3 text-meta min-w-0 flex-1 bg-transparent outline-none"
      />
    </div>
  );
}

function Counter({
  shown,
  options,
}: {
  shown: FilterOption[];
  options: FilterOption[];
}) {
  const { t } = useTranslation();

  return (
    <span className="text-ink-3 text-mini pr-1.5 tabular-nums">
      {t("filter.shownOf", { shown: shown.length, total: options.length })}
    </span>
  );
}

function Nothing({ query }: { query: string }) {
  const { t } = useTranslation();

  return (
    <p className="text-ink-3 text-meta px-2 py-4 text-center">
      {t("common.nothingMatches", { query: query.trim() })}
    </p>
  );
}

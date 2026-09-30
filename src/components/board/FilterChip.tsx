import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FloatingPortal } from "@floating-ui/react";
import { ChevronDownIcon, SearchIcon } from "lucide-react";

import { POPOVER_PANEL } from "@/components/ui/controlChrome";
import { useBoardId } from "@/hooks/useBoardId";
import type { BoardView } from "@/hooks/useBoardView";
import { useAuth } from "@/services/auth/useAuth";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { filterOptions, matchOptions } from "@/services/todos/filterOptions";
import { FILTER_LABELS, type FilterCategory } from "@/services/todos/view";
import { TOOLBAR_LABELS } from "@/services/views/toolbar";
import { useStatuses } from "@/services/workflow/useWorkflow";
import { cn } from "@/utils/cn";
import FilterOptionRow from "./FilterOptionRow";
import { HEADER_CONTROL_BADGE } from "./headerControl";
import ToolbarButton from "./ToolbarButton";
import { TOOLBAR_ICONS } from "./toolbarIcons";
import { useFilterPopover } from "./useFilterPopover";

const SEARCHABLE_FROM = 7;

const FOOTER_BUTTON =
  "rounded-control text-meta focus-visible:ring-brand h-7 px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2";

// popover, not DropdownMenu — Base UI's Menu roving-tabindex/typeahead would eat keystrokes meant for the search input
export default function FilterChip({
  view,
  category,
  collapse,
}: {
  view: BoardView;
  category: FilterCategory;
  collapse?: string;
}) {
  const { t } = useTranslation();
  const { open, mounted, close, triggerProps, panelProps } = useFilterPopover();

  const count = view.filters[category].length;
  const name = FILTER_LABELS[category];
  const Icon = TOOLBAR_ICONS[category];

  return (
    <>
      <ToolbarButton
        {...triggerProps}
        label={
          count
            ? t("filter.chipSelected", { name, count })
            : t("filter.chip", { name })
        }
        text={TOOLBAR_LABELS[category]}
        collapse={collapse}
        icon={<Icon className="size-4 @6xl:hidden" />}
        className="border-transparent px-2 font-normal"
        active={count > 0}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {count > 0 && <span className={HEADER_CONTROL_BADGE}>{count}</span>}
        <ChevronDownIcon
          aria-hidden
          className="text-ink-3 -mr-0.5 hidden size-3.5 @6xl:block"
        />
      </ToolbarButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={t("filter.by", { name })}
            className={cn(
              POPOVER_PANEL,
              "z-50 flex w-[min(18rem,calc(100vw-2rem))] flex-col overflow-hidden p-0",
            )}
          >
            <FilterPanel view={view} category={category} onDone={close} />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// its own component so the search text lives exactly as long as the panel does
function FilterPanel({
  view,
  category,
  onDone,
}: {
  view: BoardView;
  category: FilterCategory;
  onDone: () => void;
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
        <div className="border-hairline flex items-center gap-2 border-b px-3 py-2">
          <SearchIcon className="text-ink-3 size-3.5 shrink-0" />
          <input
            autoFocus
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            placeholder={t("filter.searchPlaceholder", { name })}
            aria-label={t("filter.search", { name })}
            className="text-ink placeholder:text-ink-3 text-meta min-w-0 flex-1 bg-transparent outline-none"
          />
        </div>
      )}

      <div
        className={cn("max-h-64 overflow-y-auto p-1", searchable && "min-h-32")}
      >
        {shown.length === 0 ? (
          <p className="text-ink-3 text-meta px-2 py-6 text-center">
            {t("common.nothingMatches", { query: needle.trim() })}
          </p>
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

      <div className="border-hairline flex items-center gap-1 border-t p-1.5">
        <button
          type="button"
          onClick={() => view.clearCategory(category)}
          disabled={selected.length === 0}
          className={cn(
            FOOTER_BUTTON,
            "text-ink-3 enabled:hover:bg-wash-strong enabled:hover:text-ink disabled:opacity-40",
          )}
        >
          {t("common.clear")}
        </button>

        <button
          type="button"
          onClick={onDone}
          className={cn(
            FOOTER_BUTTON,
            "bg-brand text-brand-fg hover:bg-brand/90 active:bg-brand/80 focus-visible:ring-offset-elevated ml-auto px-3 focus-visible:ring-offset-2",
          )}
        >
          {t("common.done")}
        </button>
      </div>
    </>
  );
}

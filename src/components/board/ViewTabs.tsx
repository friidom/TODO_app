import { useTranslation } from "react-i18next";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  CalendarIcon,
  CheckIcon,
  EyeOffIcon,
  GaugeIcon,
  KanbanIcon,
  LayersIcon,
  ListIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  StarIcon,
  WaypointsIcon,
  type LucideIcon,
} from "lucide-react";

import DropLine, { DragChip } from "@/components/dnd/DropLine";
import ReorderContext from "@/components/dnd/ReorderContext";
import { useReorderItem } from "@/components/dnd/reorderDnd";
import IconButton from "@/components/ui/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBoardId } from "@/hooks/useBoardId";
import type { BoardView } from "@/hooks/useBoardView";
import { usePermissions } from "@/hooks/usePermissions";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import { useBoard } from "@/services/boards/useBoard";
import { useUpdateBoard } from "@/services/boards/useUpdateBoard";
import type { ViewMode } from "@/services/views/registry";
import {
  TAB_LABEL_MAX,
  canHideTab,
  hiddenTabs,
  hideTab,
  isDefaultTabs,
  moveTab,
  normalizeTabs,
  renameTab,
  showTab,
  shownTabs,
  tabLabel,
  type ViewTab,
} from "@/services/views/tabs";
import { cn } from "@/utils/cn";

const ICONS: Record<ViewMode, LucideIcon> = {
  summary: GaugeIcon,
  board: KanbanIcon,
  list: ListIcon,
  calendar: CalendarIcon,
  timeline: WaypointsIcon,
  backlog: LayersIcon,
};

// the underline is a pseudo-element inset by the padding, so it spans the label rather than the hit area;
// ring-inset because the tablist scrolls, and an outset ring would be clipped by it
const TAB =
  "text-meta focus-visible:ring-brand rounded-control relative flex h-10 shrink-0 items-center gap-1.5 px-2 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors after:duration-150";

const STEP: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

// Order, names and hidden tabs are the board's, set by its admins for everyone
// (boards.view_tabs); which tab a person lands on is their own (useBoardView).
export default function ViewTabs({ view }: { view: BoardView }) {
  const boardId = useBoardId();
  const { t } = useTranslation();
  const { data: board } = useBoard(boardId);
  const { canEditBoard } = usePermissions();
  const sprintsEnabled = useSprintsEnabled();
  const { mutate: updateBoard } = useUpdateBoard();

  const [renaming, setRenaming] = useState<ViewMode | null>(null);

  const tabs = useMemo(
    () => normalizeTabs(board?.view_tabs),
    [board?.view_tabs],
  );

  const shown = shownTabs(tabs, { sprintsEnabled, current: view.mode });
  const hidden = canEditBoard ? hiddenTabs(tabs, { sprintsEnabled }) : [];

  // a stale ?view=backlog selects no tab, and the tablist still needs one Tab stop
  const tabStop = shown.some((tab) => tab.mode === view.mode)
    ? view.mode
    : "board";

  function save(next: ViewTab[]) {
    if (!boardId) return;

    updateBoard({ id: boardId, view_tabs: isDefaultTabs(next) ? null : next });
  }

  // arrows move focus only; Enter or Space switches, so passing over a tab doesn't render its whole view
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = STEP[e.key];
    const all = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const index = all.indexOf(e.target as HTMLButtonElement);

    if (!step || index < 0) return;

    e.preventDefault();
    all[step(index, all.length)]?.focus();
  }

  const labelOf = (mode: string) =>
    tabLabel(tabs.find((tab) => tab.mode === mode) ?? tabs[0]!);

  return (
    <div className="-mb-px -ml-2 flex min-w-0 items-stretch gap-1">
      <ReorderContext
        describe={(mode) => t("views.tabDescribe", { name: labelOf(mode) })}
        onReorder={({ activeId, overId, side }) =>
          save(
            moveTab(
              tabs,
              activeId as ViewMode,
              overId as ViewMode,
              side ?? "after",
            ),
          )
        }
        renderOverlay={(mode) => {
          const Icon = ICONS[mode as ViewMode];

          return (
            <DragChip>
              <Icon className="text-brand size-4 shrink-0" />
              <span className="truncate">{labelOf(mode)}</span>
            </DragChip>
          );
        }}
      >
        {/* the ! is needed: global.css sets scrollbar-width on `*` unlayered, which outranks any layered utility */}
        <div
          role="tablist"
          aria-label={t("views.label")}
          onKeyDown={handleKeyDown}
          className="flex min-w-0 [scrollbar-width:none]! items-stretch gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        >
          {shown.map((tab) => (
            <Tab
              key={tab.mode}
              tab={tab}
              selected={view.mode === tab.mode}
              tabStop={tab.mode === tabStop}
              isDefault={view.defaultMode === tab.mode}
              canEdit={canEditBoard}
              renaming={renaming === tab.mode}
              onSelect={() => view.setMode(tab.mode)}
              onSetDefault={() => view.setDefaultMode(tab.mode)}
              onRenameStart={() => setRenaming(tab.mode)}
              onRenameEnd={(label) => {
                setRenaming(null);

                if (label === undefined) return;

                const next = renameTab(tabs, tab.mode, label);

                if (next.some((it, index) => it.label !== tabs[index]!.label)) {
                  save(next);
                }
              }}
              onHide={() => save(hideTab(tabs, tab.mode))}
            />
          ))}
        </div>
      </ReorderContext>

      {hidden.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <IconButton
                label={t("views.addAView")}
                size="sm"
                className="my-auto shrink-0"
              />
            }
          >
            <PlusIcon />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("views.addView")}</DropdownMenuLabel>

              {hidden.map((tab) => {
                const Icon = ICONS[tab.mode];

                return (
                  <DropdownMenuItem
                    key={tab.mode}
                    onClick={() => save(showTab(tabs, tab.mode))}
                  >
                    <Icon />
                    {tabLabel(tab)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function Tab({
  tab,
  selected,
  tabStop,
  isDefault,
  canEdit,
  renaming,
  onSelect,
  onSetDefault,
  onRenameStart,
  onRenameEnd,
  onHide,
}: {
  tab: ViewTab;
  selected: boolean;
  tabStop: boolean;
  isDefault: boolean;
  canEdit: boolean;
  renaming: boolean;
  onSelect: () => void;
  onSetDefault: () => void;
  onRenameStart: () => void;
  // undefined: cancelled. null: back to the built-in name.
  onRenameEnd: (label?: string | null) => void;
  onHide: () => void;
}) {
  const { setNodeRef, pointerProps, isDragging, edge } = useReorderItem(
    tab.mode,
    { group: "tabs", axis: "x", disabled: !canEdit || renaming },
  );

  const Icon = ICONS[tab.mode];
  const label = tabLabel(tab);

  return (
    <div
      ref={setNodeRef}
      {...pointerProps}
      className={cn(
        "group/tab relative flex shrink-0 items-stretch",
        isDragging && "opacity-40",
        // a hidden tab only shows while it is the open view, via a deep link
        tab.hidden && "opacity-60",
      )}
    >
      <DropLine edge={edge} axis="x" className="inset-y-2" />

      {renaming ? (
        <RenameInput initial={label} onDone={onRenameEnd} icon={Icon} />
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={selected}
          tabIndex={tabStop ? 0 : -1}
          onClick={onSelect}
          className={cn(
            TAB,
            selected
              ? "text-ink after:bg-brand font-medium"
              : "text-ink-3 hover:text-ink hover:after:bg-hairline",
          )}
        >
          <Icon
            className={cn(
              "size-4 shrink-0 transition-opacity duration-150",
              "group-focus-within/tab:opacity-0 group-hover/tab:opacity-0 group-has-[[aria-expanded=true]]/tab:opacity-0",
              selected && "text-brand",
            )}
          />
          <span className="max-w-48 truncate">{label}</span>
        </button>
      )}

      {!renaming && (
        <TabMenu
          label={label}
          selected={selected}
          isDefault={isDefault}
          canEdit={canEdit}
          renamed={tab.label !== null}
          canHide={canHideTab(tab.mode)}
          onSetDefault={onSetDefault}
          onRenameStart={onRenameStart}
          onResetName={() => onRenameEnd(null)}
          onHide={onHide}
        />
      )}
    </div>
  );
}

// Laid over the tab's icon, as Jira does, so it costs the label no width and
// the tab does not grow on hover. The icon fades out beneath it rather than the
// button masking it: a mask has to match whatever it sits on, and this strip is
// canvas while control chrome is surface, so the mask read as a lighter patch.
function TabMenu({
  label,
  selected,
  isDefault,
  canEdit,
  renamed,
  canHide,
  onSetDefault,
  onRenameStart,
  onResetName,
  onHide,
}: {
  label: string;
  selected: boolean;
  isDefault: boolean;
  canEdit: boolean;
  renamed: boolean;
  canHide: boolean;
  onSetDefault: () => void;
  onRenameStart: () => void;
  onResetName: () => void;
  onHide: () => void;
}) {
  // Base UI returns focus to the trigger as the menu closes, which would pull
  // it straight back out of the rename field that just took it.
  const renameStarting = useRef(false);
  const { t } = useTranslation();

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) renameStarting.current = false;
      }}
    >
      <DropdownMenuTrigger
        render={
          <IconButton
            label={t("views.tabActions", { name: label })}
            size="xs"
            data-no-drag
            tabIndex={selected ? 0 : -1}
            className="absolute top-1/2 left-1 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-48"
        finalFocus={() => !renameStarting.current}
      >
        <DropdownMenuItem onClick={onSetDefault}>
          <StarIcon />
          <span className="flex-1">{t("views.setDefault")}</span>
          {isDefault && <CheckIcon className="text-brand" />}
        </DropdownMenuItem>

        {canEdit && (
          <>
            <DropdownMenuItem
              onClick={() => {
                renameStarting.current = true;
                onRenameStart();
              }}
            >
              <PencilIcon />
              {t("common.rename")}
            </DropdownMenuItem>

            {renamed && (
              <DropdownMenuItem onClick={onResetName}>
                <RotateCcwIcon />
                {t("views.resetName")}
              </DropdownMenuItem>
            )}

            {canHide && (
              <>
                <DropdownMenuSeparator />

                <DropdownMenuItem onClick={onHide}>
                  <EyeOffIcon />
                  {t("views.hideTab")}
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RenameInput({
  initial,
  icon: Icon,
  onDone,
}: {
  initial: string;
  icon: LucideIcon;
  onDone: (label?: string | null) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  // Enter commits and unmounts the field, which then blurs — without this the
  // blur would commit a second time.
  const done = useRef(false);

  function finish(label?: string | null) {
    if (done.current) return;

    done.current = true;
    onDone(label);
  }

  return (
    <span className="flex h-10 shrink-0 items-center gap-1.5 px-2">
      <Icon className="text-brand size-4 shrink-0" />
      <input
        autoFocus
        value={value}
        maxLength={TAB_LABEL_MAX}
        aria-label={t("views.tabName")}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(value.trim() || null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(value.trim() || null);
          } else if (e.key === "Escape") {
            // the board's dialogs close on a document-level Escape
            e.preventDefault();
            e.stopPropagation();
            finish();
          }
        }}
        className="text-ink text-meta border-brand/50 ring-brand/30 rounded-control h-7 w-36 border bg-transparent px-1.5 font-medium ring-2 outline-none"
      />
    </span>
  );
}

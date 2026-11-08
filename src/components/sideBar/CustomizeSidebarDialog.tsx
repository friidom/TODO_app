import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FolderIcon, GripVerticalIcon, KanbanIcon } from "lucide-react";

import DropLine, { DragChip } from "@/components/dnd/DropLine";
import ReorderContext from "@/components/dnd/ReorderContext";
import { useReorderItem, type ReorderMove } from "@/components/dnd/reorderDnd";
import DialogHeader from "@/components/ui/DialogHeader";
import Modal from "@/components/ui/Modal";
import {
  DIALOG_ACTIONS,
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
} from "@/components/ui/dialogChrome";
import { useAuth } from "@/services/auth/useAuth";
import { useBoards } from "@/services/boards/useBoards";
import { FILTER_DEFINITIONS } from "@/services/filters/registry";
import {
  SIDEBAR_DND,
  arrangeGroups,
  moved,
  restoreDefaults,
  sidebarListOf,
  spaceKeyOf,
  toggleHidden,
  type SidebarList,
} from "@/services/sidebar/layout";
import { groupBoardsBySpace } from "@/services/spaces/groupBoards";
import { useSpaces } from "@/services/spaces/useSpaces";
import { useSidebarLayout } from "@/stores/sidebarLayout";
import type { IBoard, ISpace } from "@/types/data";
import { cn } from "@/utils/cn";
import { NAV_ITEMS } from "./navItems";

const NO_BOARDS: IBoard[] = [];
const NO_SPACES: ISpace[] = [];

export default function CustomizeSidebarDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { layout, update } = useSidebarLayout();
  const { data: boards = NO_BOARDS } = useBoards();
  const { data: spaces = NO_SPACES } = useSpaces();

  const [draft, setDraft] = useState(layout);

  const groups = useMemo(
    () => arrangeGroups(groupBoardsBySpace(boards, spaces), draft),
    [boards, spaces, draft],
  );

  const hidden = new Set(draft.hidden);
  const nav = draft.nav.filter(
    (id) => id !== "admin" || user?.org_role === "superadmin",
  );

  const labels = useMemo(() => {
    const names = new Map<string, string>([
      ["spaces", t("sidebar.spaces")],
      ["filters", t("sidebar.filters")],
    ]);

    for (const [id, item] of Object.entries(NAV_ITEMS)) {
      names.set(id, t(item.labelKey));
    }

    for (const group of groups) {
      names.set(spaceKeyOf(group), group.space?.title ?? t("common.unfiled"));

      for (const board of group.boards) {
        names.set(board.id, board.title || t("common.untitledBoard"));
      }
    }

    for (const definition of Object.values(FILTER_DEFINITIONS)) {
      names.set(definition.id, t(definition.labelKey));
    }

    return names;
  }, [groups, t]);

  const label = (id: string) => labels.get(id) ?? id;

  function onReorder({ activeId, overId, side, data }: ReorderMove) {
    const list = sidebarListOf(data.group);

    if (!list || !side) return;

    setDraft((current) =>
      moved(current, groups, list, {
        activeId,
        overId,
        side,
        container: data.container,
      }),
    );
  }

  const toggle = (id: string) =>
    setDraft((current) => toggleHidden(current, id));

  function save() {
    update((current) => ({ ...draft, collapsed: current.collapsed }));
    onClose();
  }

  return (
    <Modal
      title={t("sidebar.customizeTitle")}
      onClose={onClose}
      width="w-[480px]"
    >
      <DialogHeader
        title={t("sidebar.customizeTitle")}
        description={t("sidebar.customizeDescription")}
        onClose={onClose}
        className="mb-4"
      />

      <ReorderContext
        onReorder={onReorder}
        describe={label}
        renderOverlay={(id) => (
          <DragChip>
            <GripVerticalIcon className="text-ink-3 size-3.5" />
            {label(id)}
          </DragChip>
        )}
      >
        <div className="-mx-2 max-h-[55vh] overflow-y-auto px-2">
          <Heading>{t("sidebar.navigation")}</Heading>

          <ul>
            {nav.map((id) => {
              const Icon = NAV_ITEMS[id].icon;

              return (
                <Row
                  key={id}
                  id={id}
                  list="nav"
                  label={label(id)}
                  icon={<Icon />}
                  shown={!hidden.has(id)}
                  onToggle={() => toggle(id)}
                />
              );
            })}
          </ul>

          <Heading>{t("sidebar.spacesAndShortcuts")}</Heading>

          <ul>
            {draft.sections.map((section) => (
              <Row
                key={section}
                id={section}
                list="section"
                label={label(section)}
                strong
                shown={!hidden.has(section)}
                onToggle={() => toggle(section)}
              >
                {section === "spaces"
                  ? groups.map((group) => {
                      const key = spaceKeyOf(group);
                      const muted = hidden.has("spaces");

                      return (
                        <Row
                          key={key}
                          id={key}
                          list="space"
                          label={label(key)}
                          icon={
                            group.space ? (
                              <span className="bg-brand-soft text-brand text-micro grid size-4 shrink-0 place-items-center rounded font-bold">
                                {group.space.title
                                  .trim()
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            ) : (
                              <FolderIcon />
                            )
                          }
                          locked={!group.space}
                          muted={muted}
                          shown={!hidden.has(key)}
                          onToggle={() => toggle(key)}
                        >
                          {group.boards.map((board) => (
                            <Row
                              key={board.id}
                              id={board.id}
                              list="board"
                              container={key}
                              label={label(board.id)}
                              icon={<KanbanIcon />}
                              muted={muted || hidden.has(key)}
                              shown={!hidden.has(board.id)}
                              onToggle={() => toggle(board.id)}
                            />
                          ))}
                        </Row>
                      );
                    })
                  : draft.filters.map((id) => (
                      <Row
                        key={id}
                        id={id}
                        list="filter"
                        label={label(id)}
                        muted={hidden.has("filters")}
                        shown={!hidden.has(id)}
                        onToggle={() => toggle(id)}
                      />
                    ))}
              </Row>
            ))}
          </ul>
        </div>
      </ReorderContext>

      <p className="text-ink-3 text-mini mt-3">{t("sidebar.hiddenHint")}</p>

      <footer className={DIALOG_ACTIONS}>
        <button
          type="button"
          onClick={() => setDraft(restoreDefaults)}
          className={cn(DIALOG_CANCEL, "mr-auto")}
        >
          {t("sidebar.restoreDefaults")}
        </button>

        <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
          {t("common.cancel")}
        </button>

        <button type="button" onClick={save} className={DIALOG_CONFIRM}>
          {t("common.save")}
        </button>
      </footer>
    </Modal>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-ink-3 text-mini mt-4 mb-1 px-1 font-semibold tracking-wide uppercase first:mt-0">
      {children}
    </h3>
  );
}

function Row({
  id,
  list,
  container,
  label,
  icon,
  shown,
  muted = false,
  locked = false,
  strong = false,
  onToggle,
  children,
}: {
  id: string;
  list: SidebarList;
  container?: string;
  label: string;
  icon?: ReactNode;
  shown: boolean;
  // under a hidden section or space: hidden with it whatever its own box says
  muted?: boolean;
  locked?: boolean;
  strong?: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();

  const { setNodeRef, handleProps, isDragging, edge } = useReorderItem(id, {
    group: SIDEBAR_DND[list],
    axis: "y",
    container,
    disabled: locked,
  });

  return (
    <li ref={setNodeRef} className={cn("relative", isDragging && "opacity-40")}>
      <div className="flex items-center gap-0.5">
        {locked ? (
          <span className="w-5 shrink-0" />
        ) : (
          <span
            {...handleProps}
            aria-label={t("dnd.reorder", { name: label })}
            className="text-ink-3 hover:text-ink focus-visible:ring-brand grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded outline-none focus-visible:ring-2"
          >
            <GripVerticalIcon className="size-3.5" />
          </span>
        )}

        <label
          className={cn(
            "rounded-control flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-sm transition-colors",
            muted ? "opacity-50" : "hover:bg-ink/[0.06] cursor-pointer",
          )}
        >
          <input
            type="checkbox"
            checked={shown}
            disabled={muted}
            onChange={onToggle}
            className="accent-brand size-3.5 shrink-0"
          />

          {icon && (
            <span className="text-ink-2 grid size-4 shrink-0 place-items-center [&>svg]:size-4">
              {icon}
            </span>
          )}

          <span
            className={cn(
              "text-ink min-w-0 flex-1 truncate",
              strong && "font-semibold",
            )}
          >
            {label}
          </span>
        </label>
      </div>

      {children && (
        <ul className="border-hairline ml-4.5 border-l pl-1">{children}</ul>
      )}

      <DropLine edge={edge} axis="y" className="inset-x-1" />
    </li>
  );
}

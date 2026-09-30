import { useTranslation } from "react-i18next";
import { Fragment, type ReactNode } from "react";

import BoardActions from "@/components/board/BoardActions";
import BoardGroup from "@/components/board/BoardGroup";
import BoardSearch from "@/components/board/BoardSearch";
import BoardSort from "@/components/board/BoardSort";
import FilterChip from "@/components/board/FilterChip";
import SprintControls from "@/components/board/SprintControls";
import ViewOptions from "@/components/board/ViewOptions";
import DropLine, { DragChip } from "@/components/dnd/DropLine";
import ReorderContext from "@/components/dnd/ReorderContext";
import { useReorderItem } from "@/components/dnd/reorderDnd";
import HeaderTodoForm from "@/components/layout/header/HeaderTodoForm";
import type { BoardView } from "@/hooks/useBoardView";
import { capabilitiesOf } from "@/services/views/registry";
import {
  TOOLBAR_LABELS,
  isToolbarControl,
  type ToolbarControlId,
} from "@/services/views/toolbar";
import { useToolbarControls } from "@/stores/toolbarControls";
import { cn } from "@/utils/cn";
import { TOOLBAR_ICONS } from "./toolbarIcons";

const GROUP = "toolbar";

// Collapses by container width, not viewport: the sidebar and the xl drawer both narrow this row without the viewport
// changing. It never wraps — labels drop to icons, then Group and Sort fold into View options.
// group/sort are gated per view in the registry — Summary can't do either, a chart of counts has no order.
// The List keeps its column picker in its own header and its Create in its own footer, as Jira does, so neither is here.
export default function ViewToolbar({ view }: { view: BoardView }) {
  const { t } = useTranslation();
  const { canGroup, canSort } = capabilitiesOf(view.mode);

  const order = useToolbarControls((state) => state.order);
  const move = useToolbarControls((state) => state.move);

  function control(id: ToolbarControlId): ReactNode {
    switch (id) {
      case "search":
        return (
          <Slot id={id} className="w-40 min-w-24 shrink @max-md:min-w-20">
            <BoardSearch view={view} />
          </Slot>
        );
      case "group":
        return (
          canGroup && (
            <Slot id={id} className="hidden @5xl:flex">
              <BoardGroup view={view} />
            </Slot>
          )
        );
      case "sort":
        return (
          canSort && (
            <Slot id={id} className="hidden @5xl:flex">
              <BoardSort view={view} />
            </Slot>
          )
        );
      default:
        return (
          <Slot id={id}>
            <FilterChip
              view={view}
              category={id}
              collapse="hidden @6xl:inline"
            />
          </Slot>
        );
    }
  }

  return (
    <div className="@container">
      <div className="flex items-center gap-1 @max-md:gap-1">
        <ReorderContext
          onReorder={({ activeId, overId, side }) => {
            if (
              isToolbarControl(activeId) &&
              isToolbarControl(overId) &&
              side
            ) {
              move(activeId, overId, side);
            }
          }}
          describe={(id) => (isToolbarControl(id) ? TOOLBAR_LABELS[id] : id)}
          renderOverlay={(id) => {
            if (!isToolbarControl(id)) return null;

            const Icon = TOOLBAR_ICONS[id];

            return (
              <DragChip>
                <Icon className="text-ink-3 size-4" />
                {TOOLBAR_LABELS[id]}
              </DragChip>
            );
          }}
        >
          {order.map((id) => (
            <Fragment key={id}>{control(id)}</Fragment>
          ))}
        </ReorderContext>

        {view.filterCount > 0 && (
          <button
            type="button"
            onClick={view.clearFilters}
            className="text-ink-3 hover:text-ink focus-visible:ring-brand shrink-0 rounded px-1 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2"
          >
            {t("view.clearFilters")}
          </button>
        )}

        {(canGroup || canSort) && (
          <ViewOptions view={view} className="@5xl:hidden" />
        )}

        <div className="ml-auto flex min-w-0 items-center gap-2 @max-md:gap-1.5">
          {view.mode === "board" && <SprintControls />}
          <BoardActions />
          {view.mode !== "list" && <HeaderTodoForm />}
        </div>
      </div>
    </div>
  );
}

// Dragged by the slot, not the control, so a menu trigger or the search field
// needs no drag code of its own; a press that never travels 6px stays a click.
function Slot({
  id,
  className,
  children,
}: {
  id: ToolbarControlId;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, pointerProps, isDragging, edge } = useReorderItem(id, {
    group: GROUP,
    axis: "x",
  });

  return (
    <div
      ref={setNodeRef}
      {...pointerProps}
      className={cn(
        "relative flex shrink-0",
        isDragging && "opacity-40",
        className,
      )}
    >
      <DropLine edge={edge} axis="x" />
      {children}
    </div>
  );
}

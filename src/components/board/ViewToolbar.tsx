import BoardActions from "@/components/board/BoardActions";
import BoardFilters from "@/components/board/BoardFilters";
import BoardGroup from "@/components/board/BoardGroup";
import BoardSearch from "@/components/board/BoardSearch";
import BoardSort from "@/components/board/BoardSort";
import SprintControls from "@/components/board/SprintControls";
import ViewOptions from "@/components/board/ViewOptions";
import HeaderTodoForm from "@/components/layout/header/HeaderTodoForm";
import type { BoardView } from "@/hooks/useBoardView";
import { capabilitiesOf } from "@/services/views/registry";

// Collapses by container width, not viewport: the sidebar and the xl drawer both narrow this row without the viewport
// changing. It never wraps — labels drop to icons, then Group and Sort fold into View options.
// group/sort are gated per view in the registry — Summary can't do either, a chart of counts has no order.
// The List keeps its column picker in its own header and its Create in its own footer, as Jira does, so neither is here.
export default function ViewToolbar({ view }: { view: BoardView }) {
  const { canGroup, canSort } = capabilitiesOf(view.mode);

  return (
    <div className="@container">
      <div className="flex items-center gap-2 @max-md:gap-1.5">
        <BoardSearch view={view} />
        <BoardFilters view={view} />
        {canGroup && <BoardGroup view={view} className="hidden @5xl:flex" />}
        {canSort && <BoardSort view={view} className="hidden @5xl:flex" />}
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

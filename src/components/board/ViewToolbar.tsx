import BoardFilters from "@/components/board/BoardFilters";
import BoardGroup from "@/components/board/BoardGroup";
import BoardSearch from "@/components/board/BoardSearch";
import BoardSort from "@/components/board/BoardSort";
import ViewTabs from "@/components/board/ViewTabs";
import HeaderTodoForm from "@/components/layout/header/HeaderTodoForm";
import type { BoardView } from "@/hooks/useBoardView";
import { capabilitiesOf } from "@/services/views/registry";

// group/sort are gated per view in the registry — Summary can't do either, a chart of counts has no order
export default function ViewToolbar({ view }: { view: BoardView }) {
  const { canGroup, canSort } = capabilitiesOf(view.mode);

  return (
    <div className="border-hairline flex min-h-12 flex-wrap items-stretch gap-x-5 gap-y-2 border-b px-5 md:px-6">
      <ViewTabs view={view} />

      <div className="ml-auto flex w-full flex-wrap items-center gap-2 self-center py-2 md:w-auto">
        <BoardSearch view={view} />
        <BoardFilters view={view} />
        {canGroup && <BoardGroup view={view} />}
        {canSort && <BoardSort view={view} />}

        <span
          aria-hidden
          className="bg-hairline mx-0.5 hidden h-5 w-px shrink-0 md:block"
        />

        <HeaderTodoForm />
      </div>
    </div>
  );
}

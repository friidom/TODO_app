import BoardFilters from "@/components/board/BoardFilters";
import BoardGroup from "@/components/board/BoardGroup";
import BoardSearch from "@/components/board/BoardSearch";
import BoardSort from "@/components/board/BoardSort";
import ViewTabs from "@/components/board/ViewTabs";
import HeaderTodoForm from "@/components/layout/header/HeaderTodoForm";
import type { BoardView } from "@/hooks/useBoardView";
import { capabilitiesOf } from "@/services/views/registry";

/**
 * The view row: which rendering, and how it is narrowed (M17).
 *
 * **One toolbar for every view, which is the point.** M16 made scope, filter,
 * search, sort and grouping properties of the *pipeline* rather than of the
 * Kanban, so there is nothing view-specific left in this row — Board and List
 * render beneath an identical strip today, and Calendar and Timeline will
 * without adding a control.
 *
 * `useBoardView` is read by `ViewShell`'s caller and threaded in rather than
 * re-read here: every control below takes the same object, so passing it once
 * keeps them provably looking at one state.
 *
 * Wraps to two rows below `md`, tabs first — on a phone, choosing the view
 * matters more than narrowing it, and the tab row scrolls sideways on its own
 * rather than squeezing the controls.
 *
 * **Group and Sort are gated on the registry** (M18). They were unconditional
 * while every view could do both; Summary can do neither — a chart of counts
 * has no order to honour and its widgets *are* groupings — so the flags M16
 * declared finally do visible work. Search and Filter stay on every view,
 * because narrowing the board is a question all three can answer.
 */
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
        <HeaderTodoForm />
      </div>
    </div>
  );
}

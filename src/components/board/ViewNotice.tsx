import { InboxIcon, LockIcon } from "lucide-react";

import type { BoardView } from "@/hooks/useBoardView";

export default function ViewNotice({
  view,
  visibleCount,
  showDragHint = false,
}: {
  view: BoardView;
  visibleCount: number;
  showDragHint?: boolean;
}) {
  // tracked separately from the filter empty-state because the undo button differs
  const query = view.query.trim();
  const empty = visibleCount === 0 && (view.filterCount > 0 || query !== "");
  const drag = showDragHint && view.dndDisabled;

  if (!empty && !drag) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {drag && (
        <p className="text-ink-3 flex items-center gap-1.5 text-xs">
          <LockIcon className="size-3.5 shrink-0" />
          <span>
            {view.dndReason} · cards cannot be dragged while the board is not
            showing its own order
          </span>
          <button
            type="button"
            onClick={view.enableDnd}
            className="text-brand hover:bg-brand-soft focus-visible:ring-brand rounded px-1.5 py-0.5 font-medium transition-colors outline-none focus-visible:ring-2"
          >
            Reset
          </button>
        </p>
      )}

      {empty && (
        <p className="text-ink-3 flex items-center gap-1.5 text-xs">
          <InboxIcon className="size-3.5 shrink-0" />
          <span>
            {query
              ? `Nothing matches “${query}”.`
              : "No cards match the current filter."}
          </span>
          <button
            type="button"
            onClick={query ? () => view.setQuery("") : view.clearFilters}
            className="text-brand hover:bg-brand-soft focus-visible:ring-brand rounded px-1.5 py-0.5 font-medium transition-colors outline-none focus-visible:ring-2"
          >
            {query ? "Clear search" : "Clear filters"}
          </button>
        </p>
      )}
    </div>
  );
}

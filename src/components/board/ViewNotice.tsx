import { InboxIcon, LockIcon } from "lucide-react";

import type { BoardView } from "@/hooks/useBoardView";

/**
 * What the view is doing to the board, said out loud.
 *
 * Two things a user can otherwise be left guessing at:
 *
 * - **Cards will not drag.** Silently inert drag handles read as a bug. The
 *   board names the reason — the sort or the grouping it is under — and offers
 *   the one click that undoes it. Columns still reorder: their order is stored
 *   order whatever the cards are doing, so that drop never became ambiguous.
 * - **The board looks empty but is not.** A filter that matches nothing renders
 *   an empty board, which is indistinguishable from a board with no work on it.
 *
 * Neither is shown unless it applies, so an ordinary board carries no chrome.
 */
export default function ViewNotice({
  view,
  visibleCount,
  showDragHint = false,
}: {
  view: BoardView;
  visibleCount: number;
  /** The list has no drag to lose, so only the board asks for this. */
  showDragHint?: boolean;
}) {
  // A search that matches nothing empties the board exactly as a filter does,
  // and leaves the same question behind. Named separately because the undo is
  // a different button: telling someone to clear a filter they never set sends
  // them to the wrong control.
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

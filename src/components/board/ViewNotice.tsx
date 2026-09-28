import type { ReactNode } from "react";
import { InboxIcon, LockIcon, type LucideIcon } from "lucide-react";

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
    <div className="mb-3 flex flex-col gap-2">
      {drag && (
        <Notice icon={LockIcon} action="Reset" onAction={view.enableDnd}>
          {view.dndReason} · cards cannot be dragged while the board is not
          showing its own order
        </Notice>
      )}

      {empty && (
        <Notice
          icon={InboxIcon}
          action={query ? "Clear search" : "Clear filters"}
          onAction={query ? () => view.setQuery("") : view.clearFilters}
        >
          {query
            ? `Nothing matches “${query}”.`
            : "No cards match the current filter."}
        </Notice>
      )}
    </div>
  );
}

function Notice({
  icon: Icon,
  action,
  onAction,
  children,
}: {
  icon: LucideIcon;
  action: string;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <p className="border-hairline bg-surface rounded-card text-meta text-ink-2 flex items-center gap-2 border py-1 pr-1 pl-3">
      <Icon className="text-ink-3 size-4 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      <button
        type="button"
        onClick={onAction}
        className="text-brand hover:bg-brand-soft focus-visible:ring-brand rounded-control h-7 shrink-0 px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2"
      >
        {action}
      </button>
    </p>
  );
}

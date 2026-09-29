import type { ReorderMove } from "@/components/dnd/reorderDnd";
import {
  statusesOfColumn,
  withColumnOrder,
  withStatusMoved,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import { insertionIndex, reorder } from "@/utils/reorder";

export const COLUMN_GROUP = "column";
export const STATUS_GROUP = "status";

const LANE = "lane:";
const UNMAPPED = "unmapped";

// A lane is both a column item (its column's id) and the container its
// statuses drop into, and one ReorderContext needs the two ids to differ.
export function laneId(columnId: string | null): string {
  return `${LANE}${columnId ?? UNMAPPED}`;
}

// null for an id that is not a lane; { columnId: null } for the Unmapped lane.
export function columnOfLane(id: string): { columnId: string | null } | null {
  if (!id.startsWith(LANE)) return null;

  const rest = id.slice(LANE.length);

  return { columnId: rest === UNMAPPED ? null : rest };
}

export function withReorderMove(
  draft: WorkflowDraft,
  move: ReorderMove,
): WorkflowDraft | null {
  if (move.data.group === COLUMN_GROUP) {
    if (move.side === null) return null;

    return withColumnOrder(
      draft,
      reorder(
        draft.columns.map((column) => column.id),
        move.activeId,
        move.overId,
        move.side,
      ),
    );
  }

  if (move.data.group !== STATUS_GROUP) return null;

  if (move.side === null) {
    const lane = columnOfLane(move.overId);

    return lane === null
      ? null
      : withStatusMoved(draft, move.activeId, lane.columnId, 0);
  }

  const over = draft.statuses.find((status) => status.id === move.overId);

  if (!over) return null;

  const ids = statusesOfColumn(draft, over.column_id).map(
    (status) => status.id,
  );

  return withStatusMoved(
    draft,
    move.activeId,
    over.column_id,
    insertionIndex(ids, move.activeId, move.overId, move.side),
  );
}

import { memo, useState } from "react";

import TodoMenu from "@/components/todo/TodoItem/TodoMenu";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import type { BoardMember } from "@/services/members/membersApi";
import {
  PINNED_COLUMN,
  type ListColumnDef,
} from "@/services/views/listColumns";
import { useDoneFlash } from "@/stores/doneFlash";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import ListCell from "./ListCell";
import { CELL, STICKY_LEFT, STICKY_RIGHT } from "./listTable";

export interface ListRowProps {
  todo: Todo;
  columns: ListColumnDef[];
  canEdit: boolean;
  keyPrefix: string;
  membersById: Map<string, BoardMember>;
  openTask: (todoId: string) => void;
}

// memo'd because a patch to one card would otherwise re-render every row, and
// each row carries several popover controls. Every prop but `todo` is hoisted
// into ListView and stable across renders, which is what makes the memo hold —
// passing `keyPrefix`/`canEdit`/`openTask` down instead of calling the hooks
// here also drops one query observer per row per hook.
const ListRow = memo(function ListRow({
  todo,
  columns,
  canEdit,
  keyPrefix,
  membersById,
  openTask,
}: ListRowProps) {
  const [editing, setEditing] = useState(false);
  const patch = useTodoPatch(todo);

  const celebrate = useDoneFlash((state) => state.todoId === todo.id);

  return (
    <tr className={cn("group h-10", celebrate && "done-flash")}>
      {columns.map((column) => {
        const pinned = column.id === PINNED_COLUMN;

        return (
          <td
            key={column.id}
            className={cn(
              CELL,
              "px-3",
              column.align === "center" && "text-center",
              pinned && STICKY_LEFT,
              // pointer-events-none rather than read-only twins of every
              // control — same look, just inert. The identity column is spared
              // because its key still has to open the task.
              !canEdit && !pinned && "pointer-events-none",
            )}
          >
            {/* A flex wrapper inside the cell, never `display:flex` on the
                <td> itself: that would drop the cell out of the table
                formatting context and table-fixed would stop sizing it. The
                controls shrink and truncate with `min-w-0 shrink`, which needs
                a flex parent to mean anything. */}
            <div
              className={cn(
                "flex min-w-0 items-center",
                column.align === "center" && "justify-center",
              )}
            >
              <ListCell
                column={column.id}
                todo={todo}
                patch={patch}
                canEdit={canEdit}
                keyPrefix={keyPrefix}
                membersById={membersById}
                openTask={openTask}
                editing={editing}
                onEditStart={() => setEditing(true)}
                onEditEnd={() => setEditing(false)}
              />
            </div>
          </td>
        );
      })}

      <td className={cn(CELL, STICKY_RIGHT, "px-1")}>
        {canEdit && (
          <div className="coarse:opacity-100 flex justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
            <TodoMenu todo={todo} onEdit={() => setEditing(true)} />
          </div>
        )}
      </td>
    </tr>
  );
});

export default ListRow;

import { type ReactNode } from "react";
import { FloatingPortal } from "@floating-ui/react";
import {
  MoreHorizontal,
  PanelRightOpenIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

import { useOpenTask } from "@/hooks/useOpenTask";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import { useDeleteTodo } from "@/services/todos/useDeleteTodo";
import type { Todo } from "@/types/data";

import AssigneeControl from "./AssigneeControl";
import DueDateControl from "./DueDateControl";
import PriorityControl from "./PriorityControl";
import StatusControl from "./StatusControl";
import WorkTypeControl from "./WorkTypeControl";
import { useCardPopover } from "./useCardPopover";

/**
 * Everything you can do to a card that the card itself does not show.
 *
 * The card stays a card: title, work type, key, due date, assignee, and nothing
 * else. **This is where the actions live**, which is the split that lets both
 * stay readable — a card communicates, a menu operates.
 *
 * It is a property panel rather than a list of verbs, and that is what makes it
 * cheap: every row hosts the control that already exists for that field,
 * unchanged. "Change work type" is `WorkTypeControl`; "change status" is
 * `StatusControl`, which delegates to `useMoveTodo` — the same `useTodoDrop`
 * mutation a drag ends in, position renumbering and done-flash included.
 * Nothing here re-implements a picker and nothing here opens a second write
 * path.
 *
 * `StatusControl` is why the old `TodoColumnMenu` is gone. That one hid the
 * card's current column (so the menu could not tell you where the card *was*)
 * and rendered `column.title` raw where the rest of the board goes through
 * `columnTitle()`. This one shows every column with a check on the current one,
 * skips a move that would change nothing, and was already written — it had
 * simply never been imported anywhere.
 */
export default function TodoMenu({
  todo,
  onEdit,
}: {
  todo: Todo;
  /** Puts the card into its inline title edit — the flow the pencil uses. */
  onEdit: () => void;
}) {
  // `hostsPopovers` is what makes the five property rows work at all. Each
  // control portals its own panel to document.body, so without it a mousedown on
  // a date or a member reads as an outside click, closes this menu, and unmounts
  // the control before its own click handler can run — the choice looked
  // registered and saved nothing.
  const { mounted, close, triggerProps, panelProps } = useCardPopover({
    hostsPopovers: true,
  });

  const { openTask } = useOpenTask();
  const patch = useTodoPatch(todo);
  const deleteTodo = useDeleteTodo();

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        aria-label="Card actions"
        className="text-ink-3 hover:bg-ink/10 hover:text-ink rounded-md p-1 transition-colors"
      >
        <MoreHorizontal size={15} />
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Card actions"
            className="border-hairline bg-elevated rounded-card z-50 w-60 border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
          >
            {/* First, because it is the way into everything the menu cannot
                show — the description above all. Opens the panel over the
                board rather than navigating (M5-06). */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openTask(todo.id);
                close();
              }}
              className="text-ink hover:bg-ink/10 focus-visible:bg-ink/10 rounded-control flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors outline-none"
            >
              <PanelRightOpenIcon className="text-ink-3 size-4 shrink-0" />
              Open details
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onEdit();
                close();
              }}
              className="text-ink hover:bg-ink/10 focus-visible:bg-ink/10 rounded-control flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors outline-none"
            >
              <PencilIcon className="text-ink-3 size-4 shrink-0" />
              Rename
            </button>

            <div className="bg-hairline my-1 h-px" />

            {/* The panel stays open while these are used: setting a priority and
                a due date in one visit is the common case, and closing after
                each would make it two. */}
            <Field label="Status">
              <StatusControl todoId={todo.id} columnId={todo.column_id} />
            </Field>

            <Field label="Work type">
              <WorkTypeControl
                value={todo.type}
                onChange={(type) => patch({ type })}
                showLabel
              />
            </Field>

            <Field label="Priority">
              <PriorityControl
                value={todo.priority}
                onChange={(priority) => patch({ priority })}
                showLabel
              />
            </Field>

            <Field label="Due date">
              <DueDateControl
                value={todo.due_date}
                onChange={(due_date) => patch({ due_date })}
                alwaysVisible
              />
            </Field>

            <Field label="Assignee">
              <AssigneeControl
                boardId={todo.board_id}
                value={todo.assignee_id}
                onChange={(assignee_id) => patch({ assignee_id })}
                alwaysVisible
              />
            </Field>

            <div className="bg-hairline my-1 h-px" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                deleteTodo.mutate(todo.id);
                close();
              }}
              className="text-status-red hover:bg-status-red/15 focus-visible:bg-status-red/15 rounded-control flex w-full items-center gap-2 px-2 py-1.5 text-sm font-medium transition-colors outline-none"
            >
              <Trash2Icon className="size-4 shrink-0" />
              Delete
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

/** One labelled property row: the field's name, and the control that sets it. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 px-2 py-1">
      <span className="text-ink-3 shrink-0 text-xs">{label}</span>
      <div className="flex min-w-0 items-center justify-end">{children}</div>
    </div>
  );
}

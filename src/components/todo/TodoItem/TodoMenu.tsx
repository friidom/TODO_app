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

export default function TodoMenu({
  todo,
  onEdit,
}: {
  todo: Todo;
  onEdit: () => void;
}) {
  // hostsPopovers matters — each field control portals its own panel, and without this a click on one reads as an outside click and closes the menu first
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
        className="text-ink-3 hover:bg-ink/10 hover:text-ink coarse:size-8 coarse:p-0 coarse:grid coarse:place-items-center rounded-md p-1 transition-colors"
      >
        <MoreHorizontal size={15} />
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Card actions"
            className="border-hairline bg-elevated rounded-card z-50 w-60 border p-1 shadow-e2"
          >
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
                alwaysVisible
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 px-2 py-1">
      <span className="text-ink-3 shrink-0 text-xs">{label}</span>
      <div className="flex min-w-0 items-center justify-end">{children}</div>
    </div>
  );
}

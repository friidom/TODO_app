import { useTranslation } from "react-i18next";
import { type ReactNode } from "react";
import { FloatingPortal } from "@floating-ui/react";
import {
  MoreHorizontal,
  PanelRightOpenIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import {
  MENU_ITEM,
  MENU_ITEM_DANGER,
  MENU_SEPARATOR,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { useOpenTask } from "@/hooks/useOpenTask";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import { useDeleteTodo } from "@/services/todos/useDeleteTodo";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";

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

  const { t } = useTranslation();
  const { openTask } = useOpenTask();
  const patch = useTodoPatch(todo);
  const deleteTodo = useDeleteTodo();

  return (
    <>
      <IconButton size="xs" label={t("card.actions")} {...triggerProps}>
        <MoreHorizontal />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={t("card.actions")}
            className={cn(POPOVER_PANEL, "z-50 w-60")}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openTask(todo.id);
                close();
              }}
              className={MENU_ITEM}
            >
              <PanelRightOpenIcon />
              {t("list.openDetails")}
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onEdit();
                close();
              }}
              className={MENU_ITEM}
            >
              <PencilIcon />
              {t("common.rename")}
            </button>

            <div className={MENU_SEPARATOR} />

            <Field label={t("fields.status")}>
              <StatusControl todoId={todo.id} statusId={todo.status_id} />
            </Field>

            <Field label={t("fields.workType")}>
              <WorkTypeControl
                value={todo.type}
                onChange={(type) => patch({ type })}
                showLabel
              />
            </Field>

            <Field label={t("fields.priority")}>
              <PriorityControl
                value={todo.priority}
                onChange={(priority) => patch({ priority })}
                showLabel
                alwaysVisible
              />
            </Field>

            <Field label={t("fields.dueDate")}>
              <DueDateControl
                value={todo.due_date}
                onChange={(due_date) => patch({ due_date })}
                alwaysVisible
              />
            </Field>

            <Field label={t("fields.assignee")}>
              <AssigneeControl
                boardId={todo.board_id}
                value={todo.assignee_id}
                onChange={(assignee_id) => patch({ assignee_id })}
                alwaysVisible
              />
            </Field>

            <div className={MENU_SEPARATOR} />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                deleteTodo.mutate(todo.id);
                close();
              }}
              className={MENU_ITEM_DANGER}
            >
              <Trash2Icon />
              {t("common.delete")}
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 min-w-0 items-center justify-between gap-2 px-2">
      <span className="text-ink-2 text-meta shrink-0">{label}</span>
      <div className="flex min-w-0 items-center justify-end">{children}</div>
    </div>
  );
}

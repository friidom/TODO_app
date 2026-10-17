import { useTranslation } from "react-i18next";
import { CornerDownLeft } from "lucide-react";
import { useState, type RefObject } from "react";

import AssigneeControl from "@/components/todo/TodoItem/AssigneeControl";
import DueDateControl from "@/components/todo/TodoItem/DueDateControl";
import WorkTypeControl from "@/components/todo/TodoItem/WorkTypeControl";
import IconButton from "@/components/ui/IconButton";
import { DEFAULT_WORK_TYPE, type WorkType } from "@/constants/workTypes";
import { cn } from "@/utils/cn";

const CARD =
  "rounded-md border-brand/60 bg-elevated ring-brand/15 shadow-e1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-98 ease-emphasized border px-2.5 py-2 ring-2 duration-150";

export interface CreateDraft {
  assignee_id: string | null;
  due_date: string | null;
  type: WorkType;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (draft: CreateDraft) => void;
  onCancel: () => void;
  boardId: string;
  className?: string;
  ref?: RefObject<HTMLDivElement | null>;
}

// no status control — status is which column a card is in, and this form is already inside one
export default function TodoCreateForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  boardId,
  className,
  ref,
}: Props) {
  const { t } = useTranslation();
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [type, setType] = useState<WorkType>(DEFAULT_WORK_TYPE);

  const canSubmit = !!value.trim();

  const submit = () =>
    onSubmit({ assignee_id: assigneeId, due_date: dueDate, type });

  return (
    <div ref={ref} className={cn(CARD, className)}>
      <input
        autoFocus
        aria-label={t("kanban.itemTitle")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("kanban.itemPlaceholder")}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }

          if (e.key === "Escape") onCancel();
        }}
        className="text-ink placeholder:text-ink-3 w-full bg-transparent text-sm outline-none"
      />

      <div className="mt-2.5 flex items-center gap-1">
        <WorkTypeControl value={type} onChange={setType} showLabel />

        <DueDateControl value={dueDate} onChange={setDueDate} alwaysVisible />

        <AssigneeControl
          boardId={boardId}
          value={assigneeId}
          onChange={setAssigneeId}
          alwaysVisible
        />

        <IconButton
          label={t("list.createItem")}
          tooltipSide="top"
          disabled={!canSubmit}
          onClick={submit}
          className={cn(
            "ml-auto",
            canSubmit
              ? "bg-brand text-brand-fg hover:bg-brand/90 hover:text-brand-fg active:bg-brand/80"
              : "bg-wash",
          )}
        >
          <CornerDownLeft />
        </IconButton>
      </div>
    </div>
  );
}

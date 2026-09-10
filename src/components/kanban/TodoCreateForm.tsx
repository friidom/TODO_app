import { CornerDownLeft } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";

import AssigneeControl from "@/components/todo/TodoItem/AssigneeControl";
import DueDateControl from "@/components/todo/TodoItem/DueDateControl";
import WorkTypeControl from "@/components/todo/TodoItem/WorkTypeControl";
import { DEFAULT_WORK_TYPE, type WorkType } from "@/constants/workTypes";

const CARD =
  "mb-2 rounded-card border-2 border-brand bg-elevated px-2.5 py-2 shadow-e1";

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
  skeleton?: boolean;
  ref?: RefObject<HTMLDivElement | null>;
}

// no status control — status is which column a card is in, and this form is already inside one
export default function TodoCreateForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  boardId,
  skeleton = false,
  ref,
}: Props) {
  const [ready, setReady] = useState(!skeleton);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [type, setType] = useState<WorkType>(DEFAULT_WORK_TYPE);

  const submit = () =>
    onSubmit({ assignee_id: assigneeId, due_date: dueDate, type });

  useEffect(() => {
    if (ready) return;

    const timer = setTimeout(() => setReady(true), 180);

    return () => clearTimeout(timer);
  }, [ready]);

  if (!ready) {
    return (
      <div ref={ref} className={CARD}>
        <div className="animate-pulse">
          <div className="bg-ink/10 h-5 w-full rounded-md" />

          <div className="mt-2.5 flex items-center gap-1">
            <div className="bg-ink/10 size-6 rounded-md" />
            <div className="bg-ink/10 size-6 rounded-md" />
            <div className="bg-ink/10 size-6 rounded-md" />

            <div className="bg-ink/10 ml-auto size-7 rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className={CARD}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What needs to be done?"
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

        <button
          type="button"
          disabled={!value.trim()}
          onClick={submit}
          className="bg-ink/5 text-ink-3 hover:bg-ink/15 ml-auto flex size-7 items-center justify-center rounded-md disabled:opacity-40"
        >
          <CornerDownLeft size={17} />
        </button>
      </div>
    </div>
  );
}

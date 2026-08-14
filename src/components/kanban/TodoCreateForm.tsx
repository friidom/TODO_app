import { CornerDownLeft } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";

import AssigneeControl from "@/components/todo/TodoItem/AssigneeControl";
import DueDateControl from "@/components/todo/TodoItem/DueDateControl";
import WorkTypeControl from "@/components/todo/TodoItem/WorkTypeControl";
import { DEFAULT_WORK_TYPE, type WorkType } from "@/constants/workTypes";

/** Card shell — shared so the skeleton and the form are the same box. */
const CARD =
  "mb-2 rounded-xl border-2 border-brand bg-elevated px-3 py-2 shadow-sm";

/** What the form collected besides the title. */
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
  /** The board whose roster the assignee picker offers. */
  boardId: string;
  /** Play the loading skeleton before showing the controls. */
  skeleton?: boolean;
  ref?: RefObject<HTMLDivElement | null>;
}

/**
 * The inline "new work item" card. Rendered either at the bottom of a column
 * (the Create button) or in the gap the user clicked.
 *
 * On open it shows a skeleton for a beat so the card lands in place before the
 * caret does — the blocks are sized to the real controls, so nothing shifts.
 * Submitting moves the card down a slot, which remounts it; the parent drops
 * `skeleton` by then so a fast typist never loses the input mid-run.
 *
 * **The assignee and due-date controls are the same components the card uses.**
 * They are controlled, so here their values live in this form's state until
 * submit rather than being patched onto a row that does not exist yet. That
 * remount on submit is also what clears the draft: the next card starts empty
 * without anything having to reset it.
 *
 * The work-type control replaced two inert buttons that stood for a type the
 * schema had no column for. It now writes `todos.type`, added in
 * 20260812090000_todos_work_type.sql, and opens on Task — the same default the
 * column carries, so submitting without touching it stores what the database
 * would have stored anyway.
 *
 * There is no status control here: status is which column a card is in, and
 * this form is already inside one.
 */
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
          <div className="bg-ink/10 h-10 w-full rounded-md" />

          <div className="mt-3 flex items-center gap-1">
            <div className="bg-ink/10 size-7 rounded-md" />
            <div className="bg-ink/10 size-7 rounded-md" />
            <div className="bg-ink/10 size-7 rounded-md" />

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

      <div className="mt-8 flex items-center gap-1">
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

import { useState } from "react";
import { Loader2 } from "lucide-react";

import Modal from "@/components/ui/Modal";
import {
  DIALOG_ACTIONS,
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_ERROR,
  DIALOG_LABEL,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { FIELD_INPUT } from "@/components/ui/fieldInput";
import { useCreateSprint, useUpdateSprint } from "@/services/sprints/useSprints";
import type { Sprint } from "@/types/data";
import { fromCalendarDay, toCalendarDay } from "@/utils/dueDate";

/**
 * Create a sprint, or edit one's own fields (M30).
 *
 * One component for both, the same reason `SpaceFormModal` is: `sprint`
 * present means edit, the parent unmounts this on close so the fields reset
 * for free, and a create form and an edit form asking for the same four
 * things would otherwise be two components drifting apart one prop at a
 * time.
 *
 * **Never edits `state`.** Starting and completing a sprint are lifecycle
 * transitions with their own server-side bulk writes (`start_sprint` /
 * `complete_sprint`) — see the migration's own header — not a field this
 * form's plain `update` may touch.
 */
export default function CreateSprintModal({
  sprint,
  onClose,
}: {
  sprint?: Sprint;
  onClose: () => void;
}) {
  const [name, setName] = useState(sprint?.name ?? "");
  const [goal, setGoal] = useState(sprint?.goal ?? "");
  const [startDate, setStartDate] = useState(
    sprint?.start_date ? toCalendarDay(sprint.start_date) : "",
  );
  const [endDate, setEndDate] = useState(
    sprint?.end_date ? toCalendarDay(sprint.end_date) : "",
  );

  const createSprint = useCreateSprint();
  const updateSprint = useUpdateSprint();

  const mutation = sprint ? updateSprint : createSprint;
  const trimmed = name.trim();

  // Same shape as `todos_date_range_check` — an inverted pair is refused by
  // `sprints_date_range_check`, so this turns that database error into a
  // disabled button rather than a toast after the fact.
  const inverted = Boolean(startDate && endDate && startDate > endDate);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!trimmed || inverted) return;

    const values = {
      name: trimmed,
      goal: goal.trim() || null,
      start_date: startDate ? fromCalendarDay(startDate) : null,
      end_date: endDate ? fromCalendarDay(endDate) : null,
    };

    if (sprint) {
      updateSprint.mutate({ id: sprint.id, ...values }, { onSuccess: onClose });
    } else {
      createSprint.mutate(values, { onSuccess: onClose });
    }
  }

  return (
    <Modal title={sprint ? "Edit sprint" : "Create sprint"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className={DIALOG_TITLE}>
          {sprint ? "Edit sprint" : "Create sprint"}
        </h2>

        <label htmlFor="sprint-name" className={`${DIALOG_LABEL} mt-5`}>
          Name
        </label>

        <input
          id="sprint-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD_INPUT}
          placeholder="Sprint 1"
        />

        <label htmlFor="sprint-goal" className={`${DIALOG_LABEL} mt-4`}>
          Goal
        </label>

        <textarea
          id="sprint-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={2}
          className={`${FIELD_INPUT} resize-none`}
          placeholder="What does finishing this sprint mean?"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sprint-start" className={DIALOG_LABEL}>
              Start date
            </label>

            <input
              id="sprint-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={FIELD_INPUT}
            />
          </div>

          <div>
            <label htmlFor="sprint-end" className={DIALOG_LABEL}>
              End date
            </label>

            <input
              id="sprint-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={FIELD_INPUT}
            />
          </div>
        </div>

        {inverted && (
          <p className={`${DIALOG_ERROR} mt-3`}>
            The end date can't be before the start date.
          </p>
        )}

        {mutation.error && (
          <p role="alert" className={DIALOG_ERROR}>
            {mutation.error.message}
          </p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            Cancel
          </button>

          <button
            type="submit"
            disabled={!trimmed || inverted || mutation.isPending}
            className={DIALOG_CONFIRM}
          >
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {mutation.isPending
              ? sprint
                ? "Saving…"
                : "Creating…"
              : sprint
                ? "Save"
                : "Create sprint"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

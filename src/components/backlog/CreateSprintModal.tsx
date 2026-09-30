import { useTranslation } from "react-i18next";
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
import {
  useCreateSprint,
  useUpdateSprint,
} from "@/services/sprints/useSprints";
import type { Sprint } from "@/types/data";
import { fromCalendarDay, toCalendarDay } from "@/utils/dueDate";

// never edits `state` — starting/completing a sprint goes through the start_sprint/complete_sprint RPCs, not this plain update
export default function CreateSprintModal({
  sprint,
  onClose,
}: {
  sprint?: Sprint;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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

  // mirrors sprints_date_range_check — disables the button instead of letting the DB reject it
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
    <Modal
      title={sprint ? t("backlog.editSprint") : t("backlog.createSprint")}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <h2 className={DIALOG_TITLE}>
          {sprint ? t("backlog.editSprint") : t("backlog.createSprint")}
        </h2>

        <label htmlFor="sprint-name" className={`${DIALOG_LABEL} mt-5`}>
          {t("common.name")}
        </label>

        <input
          id="sprint-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD_INPUT}
          placeholder={t("backlog.sprintNamePlaceholder")}
        />

        <label htmlFor="sprint-goal" className={`${DIALOG_LABEL} mt-4`}>
          {t("backlog.goal")}
        </label>

        <textarea
          id="sprint-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={2}
          className={`${FIELD_INPUT} resize-none`}
          placeholder={t("backlog.goalPlaceholder")}
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sprint-start" className={DIALOG_LABEL}>
              {t("fields.startDate")}
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
              {t("backlog.endDate")}
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
            {t("backlog.endBeforeStart")}
          </p>
        )}

        {mutation.error && (
          <p role="alert" className={DIALOG_ERROR}>
            {mutation.error.message}
          </p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            {t("common.cancel")}
          </button>

          <button
            type="submit"
            disabled={!trimmed || inverted || mutation.isPending}
            className={DIALOG_CONFIRM}
          >
            {mutation.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {mutation.isPending
              ? sprint
                ? t("common.saving")
                : t("common.creating")
              : sprint
                ? t("common.save")
                : t("backlog.createSprint")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

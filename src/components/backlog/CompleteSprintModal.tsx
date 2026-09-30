import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import Modal from "@/components/ui/Modal";
import {
  DIALOG_ACTIONS,
  DIALOG_BODY,
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_ERROR,
  DIALOG_LABEL,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { FIELD_INPUT } from "@/components/ui/fieldInput";
import { useStatuses } from "@/services/workflow/useWorkflow";
import { doneStatusIds, isDoneIn } from "@/services/workflow/statuses";
import { useCompleteSprint } from "@/services/sprints/useSprints";
import { useTodos } from "@/services/todos/useTodos";
import type { Sprint } from "@/types/data";

// asks the one thing complete_sprint's transaction can't answer itself: where unfinished work goes
export default function CompleteSprintModal({
  sprint,
  otherOpenSprints,
  onClose,
}: {
  sprint: Sprint;
  otherOpenSprints: Sprint[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [destination, setDestination] = useState<string>("backlog");

  const { data: todos = [] } = useTodos();
  const { data: statuses = [] } = useStatuses();
  const completeSprint = useCompleteSprint();

  const items = todos.filter((todo) => todo.sprint_id === sprint.id);
  const doneStatuses = doneStatusIds(statuses);
  const unfinished = items.filter((todo) => !isDoneIn(todo, doneStatuses));
  const finished = items.length - unfinished.length;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    completeSprint.mutate(
      {
        sprintId: sprint.id,
        moveToSprintId: destination === "backlog" ? null : destination,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal title={t("sprint.complete")} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className={DIALOG_TITLE}>
          {t("backlog.completeTitle", { name: sprint.name })}
        </h2>

        <p className={`${DIALOG_BODY} mt-1.5`}>
          {finished > 0
            ? `${t("backlog.finishedStay", { count: finished })} `
            : ""}
          {unfinished.length > 0
            ? t("backlog.unfinishedMove", { count: unfinished.length })
            : t("backlog.nothingUnfinished")}
        </p>

        {unfinished.length > 0 && (
          <>
            <label
              htmlFor="complete-destination"
              className={`${DIALOG_LABEL} mt-4`}
            >
              {t("backlog.moveUnfinishedTo")}
            </label>

            <select
              id="complete-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className={FIELD_INPUT}
            >
              <option value="backlog">{t("views.backlog")}</option>
              {otherOpenSprints.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </>
        )}

        {completeSprint.error && (
          <p role="alert" className={DIALOG_ERROR}>
            {completeSprint.error.message}
          </p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            {t("common.cancel")}
          </button>

          <button
            type="submit"
            disabled={completeSprint.isPending}
            className={DIALOG_CONFIRM}
          >
            {completeSprint.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {completeSprint.isPending
              ? t("backlog.completing")
              : t("sprint.complete")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

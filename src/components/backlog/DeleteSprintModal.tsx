import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import Modal from "@/components/ui/Modal";
import {
  DIALOG_ACTIONS,
  DIALOG_BODY,
  DIALOG_CANCEL,
  DIALOG_DANGER,
  DIALOG_ERROR,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { useDeleteSprint } from "@/services/sprints/useSprints";
import { useTodos } from "@/services/todos/useTodos";
import type { Sprint } from "@/types/data";

// deletes only the sprint container — sprint_id is on delete set null, so items return to the Backlog, nothing is lost
export default function DeleteSprintModal({
  sprint,
  onClose,
}: {
  sprint: Sprint;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: todos = [] } = useTodos();
  const deleteSprint = useDeleteSprint();

  const items = todos.filter((todo) => todo.sprint_id === sprint.id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    deleteSprint.mutate(sprint.id, { onSuccess: onClose });
  }

  return (
    <Modal title={t("backlog.deleteSprint")} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className={DIALOG_TITLE}>
          {t("workflow.deleteQuestion", { name: sprint.name })}
        </h2>

        <p className={`${DIALOG_BODY} mt-1.5`}>
          {items.length > 0
            ? t("backlog.deleteReturns", { count: items.length })
            : t("backlog.deleteEmpty")}
        </p>

        {deleteSprint.error && (
          <p role="alert" className={DIALOG_ERROR}>
            {deleteSprint.error.message}
          </p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            {t("common.cancel")}
          </button>

          <button
            type="submit"
            disabled={deleteSprint.isPending}
            className={DIALOG_DANGER}
          >
            {deleteSprint.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {deleteSprint.isPending
              ? t("common.deleting")
              : t("backlog.deleteSprint")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

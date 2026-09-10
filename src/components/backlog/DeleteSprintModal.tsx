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
  const { data: todos = [] } = useTodos();
  const deleteSprint = useDeleteSprint();

  const items = todos.filter((todo) => todo.sprint_id === sprint.id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    deleteSprint.mutate(sprint.id, { onSuccess: onClose });
  }

  return (
    <Modal title="Delete sprint" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className={DIALOG_TITLE}>Delete “{sprint.name}”?</h2>

        <p className={`${DIALOG_BODY} mt-1.5`}>
          {items.length > 0
            ? `${items.length} ${items.length === 1 ? "item returns" : "items return"} to the Backlog. No work is deleted — only the sprint itself.`
            : "This sprint is empty. Only the sprint itself is deleted."}
        </p>

        {deleteSprint.error && (
          <p role="alert" className={DIALOG_ERROR}>
            {deleteSprint.error.message}
          </p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            Cancel
          </button>

          <button
            type="submit"
            disabled={deleteSprint.isPending}
            className={DIALOG_DANGER}
          >
            {deleteSprint.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {deleteSprint.isPending ? "Deleting…" : "Delete sprint"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

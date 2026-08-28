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

/**
 * Deleting a sprint — the planning container, never the work in it.
 *
 * **The reassurance is the whole point of the dialog.** "Delete" beside a
 * section holding twelve items reads as "delete twelve items", and the
 * schema says the opposite: `todos.sprint_id` is `on delete set null`, so
 * every item returns to the Backlog in the same statement. This dialog says
 * that in the count, out of the same cached `todos` array the section header
 * counted from — no second query, and nothing it claims can disagree with
 * what the delete is about to do.
 *
 * **Only a future sprint reaches this.** `SprintSection` offers the action
 * on `future` only: an active sprint's exit is *Complete sprint*, which
 * decides where unfinished work goes and keeps the record of what shipped,
 * and a completed one has no section in this view to delete from
 * (`buildBacklogBoard` filters it out). That mirrors the lifecycle guards
 * `start_sprint` and `complete_sprint` already enforce in the database
 * rather than inventing a fourth rule — it is a UX guard, not a security
 * boundary, and the RLS policy remains the one that decides who may delete.
 *
 * Borrows `DeleteColumnModal`'s shell exactly — `DIALOG_DANGER` for the
 * confirm, quiet Cancel beside it — so the two destructive dialogs in the
 * product read as one gesture.
 */
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

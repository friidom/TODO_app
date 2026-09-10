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
import { useColumns } from "@/services/columns/useColumnsApi";
import { doneColumnIds } from "@/services/todos/subtasks";
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
  const [destination, setDestination] = useState<string>("backlog");

  const { data: todos = [] } = useTodos();
  const { data: columns = [] } = useColumns();
  const completeSprint = useCompleteSprint();

  const items = todos.filter((todo) => todo.sprint_id === sprint.id);
  const doneColumns = doneColumnIds(columns);
  const unfinished = items.filter(
    (todo) => todo.column_id === null || !doneColumns.has(todo.column_id),
  );
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
    <Modal title="Complete sprint" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className={DIALOG_TITLE}>Complete “{sprint.name}”</h2>

        <p className={`${DIALOG_BODY} mt-1.5`}>
          {finished > 0
            ? `${finished} finished ${finished === 1 ? "item stays" : "items stay"} marked as completed in this sprint. `
            : ""}
          {unfinished.length > 0
            ? `${unfinished.length} unfinished ${unfinished.length === 1 ? "item" : "items"} will move.`
            : "Nothing is left unfinished."}
        </p>

        {unfinished.length > 0 && (
          <>
            <label htmlFor="complete-destination" className={`${DIALOG_LABEL} mt-4`}>
              Move unfinished work to
            </label>

            <select
              id="complete-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className={FIELD_INPUT}
            >
              <option value="backlog">Backlog</option>
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
            Cancel
          </button>

          <button
            type="submit"
            disabled={completeSprint.isPending}
            className={DIALOG_CONFIRM}
          >
            {completeSprint.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {completeSprint.isPending ? "Completing…" : "Complete sprint"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

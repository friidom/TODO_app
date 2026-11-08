import { doneStatusIds, isDoneIn } from "@/services/workflow/statuses";
import type { IStatus, Todo } from "@/types/data";
import { taskKey } from "@/utils/taskKey";
import { epicTaskProgress, epicsOf } from "./subtasks";

export interface EpicChoice {
  epic: Todo;
  key: string | null;
  done: number;
  total: number;
  isDone: boolean;
}

export function epicChoices(
  todos: Todo[],
  statuses: IStatus[],
  keyPrefix: string,
): EpicChoice[] {
  const done = doneStatusIds(statuses);
  const progress = epicTaskProgress(todos, statuses);

  return epicsOf(todos).map((epic) => ({
    epic,
    key: taskKey(keyPrefix, epic.board_key),
    done: progress.get(epic.id)?.done ?? 0,
    total: progress.get(epic.id)?.total ?? 0,
    isDone: isDoneIn(epic, done),
  }));
}

// The chosen Epic stays listed even when finished, so the current value never
// disappears from its own picker.
export function filterEpicChoices(
  choices: EpicChoice[],
  {
    query,
    showDone,
    selectedId,
  }: { query: string; showDone: boolean; selectedId: string | null },
): EpicChoice[] {
  const needle = query.trim().replace(/\s+/g, " ").toLowerCase();

  return choices.filter(
    (choice) =>
      (showDone || !choice.isDone || choice.epic.id === selectedId) &&
      (!needle ||
        (choice.epic.title ?? "").toLowerCase().includes(needle) ||
        (choice.key ?? "").toLowerCase().includes(needle)),
  );
}

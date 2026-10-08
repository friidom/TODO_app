import { useMemo } from "react";

import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import { useSprints } from "@/services/sprints/useSprints";
import { isEpic } from "@/services/todos/subtasks";
import { useTodos } from "@/services/todos/useTodos";
import type { Sprint, Todo } from "@/types/data";

const NO_TODOS: Todo[] = [];
const NO_SPRINTS: Sprint[] = [];

// The names the Parent and Sprint card fields show, built once per column and looked up by id, so no card gains a
// hook of its own. Board cards are never subtasks, so an Epic is the only parent one can have.
export function useCardLabels() {
  const { data: todos = NO_TODOS } = useTodos();
  const { data: sprints = NO_SPRINTS } = useSprints();
  const sprintsEnabled = useSprintsEnabled();

  const parents = useMemo(
    () =>
      new Map(todos.filter(isEpic).map((epic) => [epic.id, epic.title ?? ""])),
    [todos],
  );

  const sprintNames = useMemo(
    () =>
      new Map(
        sprintsEnabled ? sprints.map((sprint) => [sprint.id, sprint.name]) : [],
      ),
    [sprints, sprintsEnabled],
  );

  return { parents, sprints: sprintNames };
}

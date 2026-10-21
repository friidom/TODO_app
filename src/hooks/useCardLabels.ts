import { useMemo } from "react";

import { useBoardId } from "@/hooks/useBoardId";
import { memberName } from "@/components/members/memberLabels";
import { useBoard } from "@/services/boards/useBoard";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { spaceNameOf } from "@/services/spaces/boardSpace";
import { useSpaces } from "@/services/spaces/useSpaces";
import { isEpic } from "@/services/todos/subtasks";
import { useTodos } from "@/services/todos/useTodos";
import type { BoardMember } from "@/services/members/membersApi";
import type { Todo } from "@/types/data";

const NO_TODOS: Todo[] = [];
const NO_MEMBERS: BoardMember[] = [];

// The names the Parent and Space card fields show, built once per column and looked up by id, so no card gains a
// hook of its own. Board cards are never subtasks, so an Epic is the only parent one can have. A card's space is its
// board's, the same as the header's breadcrumb.
export function useCardLabels() {
  const { data: todos = NO_TODOS } = useTodos();
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);
  const { data: members = NO_MEMBERS } = useBoardMembers(boardId);
  const { data: spaces } = useSpaces();

  const parents = useMemo(
    () =>
      new Map(todos.filter(isEpic).map((epic) => [epic.id, epic.title ?? ""])),
    [todos],
  );

  const space = board ? (spaceNameOf(board, spaces) ?? undefined) : undefined;

  const people = useMemo(
    () => new Map(members.map((member) => [member.id, memberName(member)])),
    [members],
  );

  return { parents, space, people };
}

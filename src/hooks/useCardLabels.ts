import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useBoardId } from "@/hooks/useBoardId";
import { memberName } from "@/components/members/memberLabels";
import { useBoard } from "@/services/boards/useBoard";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { useSpaces } from "@/services/spaces/useSpaces";
import { isEpic } from "@/services/todos/subtasks";
import { useTodos } from "@/services/todos/useTodos";
import { useStatuses } from "@/services/workflow/useWorkflow";
import type { BoardMember } from "@/services/members/membersApi";
import type { IStatus, Todo } from "@/types/data";

const NO_TODOS: Todo[] = [];
const NO_MEMBERS: BoardMember[] = [];
const NO_STATUSES: IStatus[] = [];

// The names the Parent and Space card fields show, built once per column and looked up by id, so no card gains a
// hook of its own. Board cards are never subtasks, so an Epic is the only parent one can have. A card's space is its
// board's, the same as the header's breadcrumb.
export function useCardLabels() {
  const { t } = useTranslation();
  const { data: todos = NO_TODOS } = useTodos();
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);
  const { data: members = NO_MEMBERS } = useBoardMembers(boardId);
  const { data: statuses = NO_STATUSES } = useStatuses();
  const { data: spaces } = useSpaces();

  const parents = useMemo(
    () =>
      new Map(todos.filter(isEpic).map((epic) => [epic.id, epic.title ?? ""])),
    [todos],
  );

  const space =
    !board || spaces === undefined
      ? undefined
      : (spaces.find((it) => it.id === board.space_id)?.title ??
        t("common.unfiled"));

  const statusById = useMemo(
    () => new Map(statuses.map((status) => [status.id, status])),
    [statuses],
  );

  const people = useMemo(
    () => new Map(members.map((member) => [member.id, memberName(member)])),
    [members],
  );

  return { parents, space, statuses: statusById, people };
}

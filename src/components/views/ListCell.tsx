import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";

import AssigneeControl from "@/components/todo/TodoItem/AssigneeControl";
import DueDateControl from "@/components/todo/TodoItem/DueDateControl";
import EpicParentControl from "@/components/todo/TodoItem/EpicParentControl";
import EstimateControl from "@/components/todo/TodoItem/EstimateControl";
import PriorityControl from "@/components/todo/TodoItem/PriorityControl";
import SprintControl from "@/components/todo/TodoItem/SprintControl";
import StartDateControl from "@/components/todo/TodoItem/StartDateControl";
import StatusControl from "@/components/todo/TodoItem/StatusControl";
import WorkTypeControl from "@/components/todo/TodoItem/WorkTypeControl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { useBoardId } from "@/hooks/useBoardId";
import type { TodoFields } from "@/hooks/useTodoPatch";
import { useColumns } from "@/services/columns/useColumnsApi";
import type { BoardMember } from "@/services/members/membersApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { activeSprintIdOf } from "@/services/sprints/activeSprint";
import { useSprints } from "@/services/sprints/useSprints";
import { sprintAssignmentPatch } from "@/services/todos/backlog";
import { isEpic } from "@/services/todos/subtasks";
import type { ListColumnId } from "@/services/views/listColumns";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";
import { taskKey } from "@/utils/taskKey";

export interface ListCellProps {
  column: ListColumnId;
  todo: Todo;
  patch: (fields: TodoFields, options?: { onSuccess?: () => void }) => void;
  canEdit: boolean;
  keyPrefix: string;
  membersById: Map<string, BoardMember>;
  openTask: (todoId: string) => void;
  editing: boolean;
  onEditEnd: () => void;
  onEditStart: () => void;
  done: boolean;
  /** 0 for a row of the pipeline, 1 for a subtask nested under one. */
  depth: number;
  childCount: number;
  expanded: boolean;
  onToggleExpand: (todoId: string) => void;
}

// One switch, no hooks of its own — each branch is a component so the ones that
// need a query (Sprint) can call for it without every other cell paying for it.
export default function ListCell(props: ListCellProps) {
  const { column, todo, patch } = props;

  switch (column) {
    case "work":
      return <WorkCell {...props} />;

    case "assignee":
      return (
        <AssigneeControl
          variant="cell"
          boardId={todo.board_id}
          value={todo.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
        />
      );

    case "reporter":
      return <MemberCell id={todo.creator_id} members={props.membersById} />;

    case "priority":
      return (
        <PriorityControl
          variant="cell"
          value={todo.priority}
          onChange={(priority) => patch({ priority })}
        />
      );

    case "status":
      return (
        <StatusControl
          variant="lozenge"
          todoId={todo.id}
          columnId={todo.column_id}
        />
      );

    case "due":
      return (
        <DueDateControl
          variant="cell"
          value={todo.due_date}
          notBefore={todo.start_date}
          onChange={(due_date) => patch({ due_date })}
        />
      );

    case "start":
      return (
        <StartDateControl
          variant="cell"
          value={todo.start_date}
          notAfter={todo.due_date}
          onChange={(start_date) => patch({ start_date })}
        />
      );

    case "estimate":
      return (
        <EstimateControl
          variant="cell"
          value={todo.estimate}
          onChange={(estimate) => patch({ estimate })}
        />
      );

    case "sprint":
      // enforce_work_item_hierarchy refuses a Subtask its own sprint — it rides
      // with its parent's.
      return props.depth > 0 ? (
        <NotApplicable />
      ) : (
        <SprintCell todo={todo} patch={patch} />
      );

    case "parent":
      // An Epic takes no parent, and a Subtask's parent is the row it is nested
      // under — neither has an Epic to offer.
      return isEpic(todo) || props.depth > 0 ? (
        <NotApplicable />
      ) : (
        <EpicParentControl
          variant="cell"
          value={todo.parent_id}
          onChange={(parent_id) => patch({ parent_id })}
        />
      );

    case "created":
      return <TimeCell value={todo.created_at} />;

    case "updated":
      return <TimeCell value={todo.updated_at} />;

    case "completed":
      return <TimeCell value={todo.completed_at} />;

    default: {
      // Adding an id to the registry without a cell for it is a build error
      // here rather than a silently blank column.
      const unhandled: never = column;

      return unhandled;
    }
  }
}

function None() {
  return <span className="text-ink-3 text-sm">None</span>;
}

function NotApplicable() {
  return <span className="text-ink-3/60 text-sm">—</span>;
}

function WorkCell({
  todo,
  patch,
  canEdit,
  keyPrefix,
  openTask,
  editing,
  onEditStart,
  onEditEnd,
  done,
  depth,
  childCount,
  expanded,
  onToggleExpand,
}: ListCellProps) {
  const [draft, setDraft] = useState(todo.title ?? "");
  const [wasEditing, setWasEditing] = useState(editing);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reseeded when the editor opens, not on mount — adjusted during render
  // rather than in an effect, the idiom BoardSearch uses, so a title changed by
  // another client is what you start editing rather than a stale first read.
  if (wasEditing !== editing) {
    setWasEditing(editing);

    if (editing) setDraft(todo.title ?? "");
  }

  useEffect(() => {
    if (!editing) return;

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const key = taskKey(keyPrefix, todo.board_key);

  function save() {
    const title = draft.trim();

    if (title === "" || title === todo.title) {
      onEditEnd();
      return;
    }

    // held open until the write lands, so a rejected rename does not silently
    // discard what was typed
    patch({ title }, { onSuccess: onEditEnd });
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {depth > 0 && (
        <span aria-hidden className="shrink-0" style={{ width: depth * 24 }} />
      )}

      <span className="grid size-6 shrink-0 place-items-center">
        {childCount > 0 && (
          <button
            type="button"
            data-disclosure
            onClick={() => onToggleExpand(todo.id)}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? "Hide subtasks"
                : `Show ${childCount} ${childCount === 1 ? "subtask" : "subtasks"}`
            }
            className="text-ink-2 hover:bg-wash-strong hover:text-ink focus-visible:ring-brand grid size-6 place-items-center rounded transition-colors outline-none focus-visible:ring-2"
          >
            <ChevronRightIcon
              className={cn(
                "size-4 transition-transform duration-150",
                expanded && "rotate-90",
              )}
            />
          </button>
        )}
      </span>

      <span className={cn("flex shrink-0", !canEdit && "pointer-events-none")}>
        <WorkTypeControl
          bare
          value={todo.type}
          onChange={(type) => patch({ type })}
        />
      </span>

      {key !== null ? (
        <button
          type="button"
          onClick={() => openTask(todo.id)}
          title={`Open ${key}`}
          className={cn(
            "text-brand focus-visible:ring-brand mr-2 shrink-0 rounded text-sm font-medium whitespace-nowrap underline-offset-[3px] outline-none focus-visible:ring-2",
            // Jira's cue for resolved work, read straight off the column category
            done
              ? "decoration-brand/70 line-through"
              : "decoration-brand/50 hover:decoration-brand underline",
          )}
        >
          {key}
        </button>
      ) : (
        <span className="text-ink-3/60 mr-2 shrink-0 text-sm">—</span>
      )}

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") {
              event.stopPropagation();
              onEditEnd();
            }
          }}
          aria-label="Title"
          className="border-brand text-ink h-7 min-w-0 flex-1 rounded border bg-(--list-row) px-1.5 text-sm outline-none"
        />
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => onEditStart()}
          title={todo.title ?? undefined}
          className="text-ink hover:bg-wash-strong focus-visible:ring-brand -mx-1 min-w-0 truncate rounded px-1 py-0.5 text-left text-sm transition-colors outline-none focus-visible:ring-2"
        >
          {todo.title || <span className="text-ink-3">Untitled</span>}
        </button>
      ) : (
        <span
          title={todo.title ?? undefined}
          className="text-ink min-w-0 truncate text-sm"
        >
          {todo.title || <span className="text-ink-3">Untitled</span>}
        </span>
      )}
    </div>
  );
}

// Read-only: there is no endpoint that reassigns creator_id, and there should
// not be — who filed the work is a fact about what happened.
function MemberCell({
  id,
  members,
}: {
  id: string | null;
  members: Map<string, BoardMember>;
}) {
  if (id === null) return <None />;

  const member = members.get(id);

  if (!member) {
    // creator_id survives the author leaving the board, so the row still has an
    // id the roster cannot name.
    return <span className="text-ink-3 text-sm italic">Former member</span>;
  }

  const name = memberName(member);

  return (
    <span className="flex min-w-0 items-center gap-2" title={name}>
      <Avatar size="sm">
        <AvatarImage src={member.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-ink/10 text-ink-2 text-micro font-semibold">
          {memberInitial(member)}
        </AvatarFallback>
      </Avatar>

      <span className="text-ink min-w-0 truncate text-sm">{name}</span>
    </span>
  );
}

// Goes through sprintAssignmentPatch rather than patching sprint_id directly:
// column_id and sprint_id answer different questions, and that function is the
// one place allowed to decide what moving between sprints does to the column.
function SprintCell({
  todo,
  patch,
}: {
  todo: Todo;
  patch: (fields: TodoFields) => void;
}) {
  const boardId = useBoardId();
  const queryClient = useQueryClient();
  const { data: sprints = [] } = useSprints();
  const { data: columns = [] } = useColumns();

  return (
    <SprintControl
      variant="cell"
      value={todo.sprint_id}
      sprints={sprints}
      onChange={(sprintId) => {
        // read at click time rather than through useTodos(), so a column that is
        // usually hidden does not add an observer per row
        const todos =
          queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

        patch(
          sprintAssignmentPatch(
            todo,
            sprintId,
            activeSprintIdOf(sprints),
            columns,
            todos,
          ),
        );
      }}
    />
  );
}

function TimeCell({ value }: { value: string | null }) {
  const relative = relativeTime(value);

  if (value === null || relative === null) return <None />;

  return (
    <time
      dateTime={value}
      title={new Date(value).toLocaleString()}
      className="text-ink-2 truncate text-sm tabular-nums"
    >
      {relative}
    </time>
  );
}

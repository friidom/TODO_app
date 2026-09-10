import { useDraggable } from "@dnd-kit/core";

import { memberInitial, memberName } from "@/components/members/memberLabels";
import { PRIORITIES, toPriority } from "@/constants/priorities";
import { workTypeOf } from "@/constants/workTypes";
import type { BoardMember } from "@/services/members/membersApi";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";

// Not TodoCard — a day cell needs a one-line summary, not a 100px card with controls.
export default function CalendarChip({
  todo,
  keyPrefix,
  assignee,
  draggable,
  onOpen,
  overlay = false,
}: {
  todo: Todo;
  keyPrefix: string;
  assignee?: BoardMember;
  draggable: boolean;
  onOpen: () => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: todo.id,
    disabled: !draggable || overlay,
    data: { todo },
  });

  const type = workTypeOf(todo.type);
  const TypeIcon = type.icon;

  const priority = toPriority(todo.priority);
  const meta = priority ? PRIORITIES[priority] : null;
  const PriorityIcon = meta?.icon;

  const key = taskKey(keyPrefix, todo.board_key);

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      role="button"
      tabIndex={overlay ? -1 : 0}
      title={todo.title ?? undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "border-hairline bg-elevated rounded-control flex h-6 w-full items-center gap-1.5 border px-1.5 text-left transition-colors select-none",
        "focus-visible:ring-brand outline-none focus-visible:ring-2",
        // touch-none — without it a touch drag scrolls the grid before the sensor sees it
        draggable &&
          !overlay &&
          "cursor-grab touch-none active:cursor-grabbing",
        !overlay && "hover:border-ink/20 hover:bg-ink/[0.06]",
        isDragging && "opacity-40",
        overlay && "border-brand/40 shadow-e3",
      )}
    >
      <TypeIcon className={cn("size-3 shrink-0", type.tone)} />

      {key && (
        <span className="text-ink-3/80 text-micro shrink-0 font-medium tabular-nums">
          {key}
        </span>
      )}

      <span className="text-ink text-mini min-w-0 flex-1 truncate">
        {todo.title || <span className="text-ink-3/60">Untitled</span>}
      </span>

      {PriorityIcon && (
        <PriorityIcon className={cn("size-3 shrink-0", meta?.tone)} />
      )}

      {assignee && <ChipAvatar member={assignee} />}
    </div>
  );
}

// Not ui/avatar — its smallest variant is 24px and overriding it fights tailwind-merge on a data- variant.
function ChipAvatar({ member }: { member: BoardMember }) {
  const name = memberName(member);

  if (member.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt=""
        title={name}
        className="border-hairline size-4 shrink-0 rounded-full border object-cover"
      />
    );
  }

  return (
    <span
      title={name}
      className="bg-ink/10 text-ink-2 text-micro grid size-[18px] shrink-0 place-items-center rounded-full font-semibold"
    >
      {memberInitial(member)}
    </span>
  );
}

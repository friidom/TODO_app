import { useDraggable } from "@dnd-kit/core";

import { memberInitial, memberName } from "@/components/members/memberLabels";
import { PRIORITIES, toPriority } from "@/constants/priorities";
import { workTypeOf } from "@/constants/workTypes";
import type { BoardMember } from "@/services/members/membersApi";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";

/**
 * One work item, as a line in a day cell (M19).
 *
 * **Not `TodoCard`.** A board card is a 100px object with three controls and a
 * menu on it; thirty-five of those in a month grid would need a cell the height
 * of the viewport. The calendar's unit is a *line* — one row, four glyphs, a
 * title — because the question a calendar answers is "what is on this day",
 * and the answer has to fit five items into a fifth of the screen.
 *
 * What survives from the card is the field vocabulary, unchanged: the work type
 * is the same coloured glyph, the priority the same arrow, the key the same
 * `KAN-12`. Nothing here re-decides what a Bug looks like.
 *
 * **It reports, it does not write.** Clicking opens the existing task modal
 * through `?task=`; dragging is `useDraggable` and the drop is the parent's to
 * handle. No mutation, no query — the same rule `TodoCard` follows and the
 * reason this renders from a plain row.
 */
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
  /** Resolved by the parent from the roster it already holds. */
  assignee?: BoardMember;
  /** Editors drag; viewers read. Gated by the caller's `canEditTodos`. */
  draggable: boolean;
  onOpen: () => void;
  /** The drag overlay copy: no drag wiring, no hover, slight lift. */
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
        // `touch-none` for the reason the board card carries it: without it a
        // touch drag scrolls the grid instead of picking the item up, because
        // the browser claims the gesture before the sensor sees it.
        draggable &&
          !overlay &&
          "cursor-grab touch-none active:cursor-grabbing",
        !overlay && "hover:border-ink/20 hover:bg-ink/[0.06]",
        // The original stays in place at reduced opacity while its copy travels
        // in the overlay — the same idiom the board uses. Opacity only, so the
        // day cell does not reflow the moment a drag starts.
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

/**
 * A 16px assignee mark.
 *
 * Not `components/ui/avatar`: that primitive's smallest variant is 24px, which
 * is the full height of this row, and forcing it smaller means overriding a
 * `data-[size=sm]:` variant that `tailwind-merge` cannot dedupe — so the class
 * would land but the primitive's would too, and which won would depend on
 * stylesheet order. Sixteen pixels of circle is cheaper written out than
 * argued with.
 */
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

import { CheckIcon, UserIcon, UserMinusIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { useCardPopover } from "./useCardPopover";
import MemberIdentity from "@/components/members/MemberIdentity";
import {
  memberInitial,
  memberName,
} from "@/components/members/memberLabels";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { cn } from "@/utils/cn";

/**
 * The card's assignee: an avatar when set, an outline button when not.
 *
 * The people list comes from `useBoardMembers`, the same `board_roster` RPC the
 * context rail uses — never `board_members`, which is self-read only and would
 * offer a picker containing just yourself. Because both call the same
 * board-scoped key, the roster is fetched once for the whole board however many
 * cards are on it.
 *
 * The panel mounts only while open, so a board's cards do not each hold a
 * subscription to the roster before anyone has asked to assign anything.
 *
 * **Controlled, like `DueDateControl`.** It reports the chosen member through
 * `onChange` and never writes. The create form and an existing card therefore
 * share this one picker — the card's parent patches through `updateTodo`, the
 * create form's holds the id until submit.
 */
export default function AssigneeControl({
  boardId,
  value: assigneeId,
  onChange,
  alwaysVisible = false,
}: {
  /**
   * The board whose roster to offer. Taken from the card rather than from
   * `useBoardId()` so it is present for a card created a moment ago, and so the
   * roster shown and the row written can never disagree.
   */
  boardId: string;
  value: string | null;
  onChange: (value: string | null) => void;
  /** Keep the trigger visible instead of revealing it on card hover. */
  alwaysVisible?: boolean;
}) {
  const { open, close, triggerProps, panelProps } = useCardPopover();

  // Read-only here: the trigger needs the assignee's avatar, and this hits the
  // cache entry the rail already populates rather than a request of its own.
  const { data: members } = useBoardMembers(boardId);
  const assignee = members?.find((member) => member.id === assigneeId) ?? null;

  const label = assignee
    ? `Assigned to ${memberName(assignee)}`
    : "Assign a member";

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={label}
        aria-label={label}
        className={cn(
          "shrink-0 rounded-full transition-opacity",
          !assigneeId &&
            !alwaysVisible &&
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        {assignee ? (
          <Avatar size="sm">
            <AvatarImage src={assignee.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-ink/10 text-ink-2 text-[10px] font-semibold">
              {memberInitial(assignee)}
            </AvatarFallback>
          </Avatar>
        ) : (
          // An assignee id with no matching roster row — a member removed from
          // the board — falls here rather than rendering a blank avatar.
          <span
            className={cn(
              "border-hairline text-ink-3 hover:text-ink-2 grid size-6 place-items-center rounded-full border border-dashed transition-colors",
              assigneeId && "border-solid",
            )}
          >
            <UserIcon className="size-3" />
          </span>
        )}
      </button>

      {open && (
        <FloatingPortal>
          <div
            {...panelProps}
            className="border-hairline bg-elevated z-50 w-60 overflow-hidden rounded-card border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
          >
            <p className="text-ink-3 px-2 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
              Assignee
            </p>

            <MemberList
              boardId={boardId}
              assigneeId={assigneeId}
              onSelect={(next) => {
                onChange(next);
                close();
              }}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

/**
 * Split out so `useBoardMembers` and the mutation are only subscribed while the
 * panel is open.
 */
function MemberList({
  boardId,
  assigneeId,
  onSelect,
}: {
  boardId: string;
  assigneeId: string | null;
  onSelect: (value: string | null) => void;
}) {
  const { data: members, isPending, error } = useBoardMembers(boardId);

  const assign = onSelect;

  if (isPending) {
    return (
      <div className="space-y-1 p-1" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2.5 px-1 py-1">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-status-red px-2 py-3 text-xs">
        Could not load members.
      </p>
    );
  }

  if (members.length === 0) {
    return (
      <p className="text-ink-3 px-2 py-3 text-xs">No members on this board.</p>
    );
  }

  return (
    <>
      <ul className="max-h-64 overflow-y-auto">
        {members.map((member) => {
          const selected = member.id === assigneeId;

          return (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => assign(selected ? null : member.id)}
                className="hover:bg-ink/10 focus-visible:bg-ink/10 flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 transition-colors outline-none"
              >
                <MemberIdentity member={member} />

                {selected && (
                  <CheckIcon className="text-brand size-4 shrink-0" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {assigneeId && (
        <>
          <div className="bg-hairline my-1 h-px" />

          <button
            type="button"
            onClick={() => assign(null)}
            className="text-ink-2 hover:bg-ink/10 hover:text-ink flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-sm transition-colors"
          >
            <UserMinusIcon className="size-3.5" />
            Unassign
          </button>
        </>
      )}
    </>
  );
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { cn } from "@/utils/cn";

/** How many faces before the rest become a count. */
const SHOWN = 4;

/**
 * Who is on this board, as overlapping avatars that open the members drawer.
 *
 * **What a 288px rail was spending its width on** (M17). The roster was worth
 * having on screen; a permanently open panel listing it was not. Four faces and
 * a count answer "who else is here" at a glance, and the drawer behind them
 * answers everything else — roles, joined dates, the management controls —
 * on demand.
 *
 * Reads the same `board_roster` RPC through the same `useBoardMembers` the
 * drawer and the assignee picker use, so it is a cache read rather than a
 * second query. The avatar treatment is `MemberIdentity`'s, minus the name:
 * base-ui falls back to initials on its own when `src` is empty or fails.
 */
export default function MemberStack({ onOpen }: { onOpen: () => void }) {
  const boardId = useBoardId();
  const { data: members = [] } = useBoardMembers(boardId);

  if (!members.length) return null;

  const shown = members.slice(0, SHOWN);
  const rest = members.length - shown.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${members.length} ${members.length === 1 ? "member" : "members"} — open members`}
      title="Members"
      className="focus-visible:ring-brand hover:bg-elevated rounded-control flex items-center -space-x-2 p-1 transition-colors outline-none focus-visible:ring-2"
    >
      {shown.map((member) => (
        <Avatar
          key={member.id}
          size="sm"
          // The ring is the board's background, so the faces read as separate
          // discs rather than one smeared row.
          className="ring-canvas shrink-0 ring-2"
        >
          <AvatarImage src={member.avatar_url ?? undefined} alt="" />
          <AvatarFallback
            className="bg-elevated text-ink-2 text-[10px] font-semibold"
            title={memberName(member)}
          >
            {memberInitial(member)}
          </AvatarFallback>
        </Avatar>
      ))}

      {rest > 0 && (
        <span
          className={cn(
            "ring-canvas bg-elevated text-ink-2 grid size-6 shrink-0 place-items-center",
            "rounded-full text-[10px] font-semibold ring-2",
          )}
        >
          +{rest}
        </span>
      )}
    </button>
  );
}

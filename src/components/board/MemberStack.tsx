import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { cn } from "@/utils/cn";

const SHOWN = 4;

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
          // ring matches the board background so overlapping faces read as separate discs
          className="ring-canvas shrink-0 ring-2"
        >
          <AvatarImage src={member.avatar_url ?? undefined} alt="" />
          <AvatarFallback
            className="bg-elevated text-ink-2 text-micro font-semibold"
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
            "text-micro rounded-full font-semibold ring-2",
          )}
        >
          +{rest}
        </span>
      )}
    </button>
  );
}

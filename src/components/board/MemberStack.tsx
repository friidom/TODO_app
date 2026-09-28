import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { cn } from "@/utils/cn";

const SHOWN = 4;

// hover fills with opaque surface, not a wash, so the avatar rings can switch to the exact same colour
const RING = "ring-canvas group-hover/members:ring-surface ring-2";

export default function MemberStack({ onOpen }: { onOpen: () => void }) {
  const boardId = useBoardId();
  const { data: members = [] } = useBoardMembers(boardId);

  if (!members.length) return null;

  const shown = members.slice(0, SHOWN);
  const rest = members.length - shown.length;
  const count = `${members.length} ${members.length === 1 ? "member" : "members"}`;

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={onOpen}
        aria-label={`${count} — open members`}
        className="group/members focus-visible:ring-brand hover:bg-surface rounded-control flex h-8 shrink-0 items-center -space-x-1.5 px-1 transition-colors duration-150 outline-none focus-visible:ring-2"
      >
        {shown.map((member) => (
          <Avatar key={member.id} size="sm" className={cn("shrink-0", RING)}>
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
              // relative like Avatar's root, or every avatar paints over this chip regardless of DOM order
              "bg-elevated text-ink-2 text-micro relative grid h-6 min-w-6 shrink-0 place-items-center rounded-full px-1 font-semibold tabular-nums",
              RING,
            )}
          >
            +{rest}
          </span>
        )}
      </TooltipTrigger>

      <TooltipContent side="bottom">{count}</TooltipContent>
    </Tooltip>
  );
}

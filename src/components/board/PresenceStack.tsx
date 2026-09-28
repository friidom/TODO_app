import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { cn } from "@/utils/cn";

const SHOWN = 3;

// Presence state from the channel, not the roster — includes viewers the roster hasn't caught up with yet.
export default function PresenceStack({
  viewers,
  className,
}: {
  viewers: string[];
  className?: string;
}) {
  const boardId = useBoardId();
  const { data: members = [] } = useBoardMembers(boardId);

  if (viewers.length === 0) return null;

  // The order is presence's, which is stable; the roster only supplies faces.
  const present = viewers.map((id) => ({
    id,
    member: members.find((member) => member.id === id),
  }));

  const shown = present.slice(0, SHOWN);
  const rest = present.length - shown.length;

  const names = present
    .map(({ member }) => (member ? memberName(member) : "Someone"))
    .join(", ");

  return (
    <div
      title={`${names} ${present.length === 1 ? "is" : "are"} on this board now`}
      aria-label={`${present.length} ${present.length === 1 ? "person" : "people"} on this board now`}
      className={cn(
        "border-hairline bg-surface rounded-control flex h-8 shrink-0 items-center gap-1.5 border pr-2 pl-2",
        className,
      )}
    >
      <span className="bg-status-green size-1.5 shrink-0 rounded-full" />

      <div className="flex items-center -space-x-2">
        {shown.map(({ id, member }) => (
          <Avatar key={id} size="sm" className="ring-surface shrink-0 ring-2">
            <AvatarImage src={member?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-elevated text-ink-2 text-micro font-semibold">
              {member ? memberInitial(member) : "–"}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>

      {rest > 0 && (
        <span className="text-ink-3 text-mini font-medium tabular-nums">
          +{rest}
        </span>
      )}
    </div>
  );
}

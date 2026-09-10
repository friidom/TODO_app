import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardMembers } from "@/services/members/useBoardMembers";

const SHOWN = 3;

// Presence state from the channel, not the roster — includes viewers the roster hasn't caught up with yet.
export default function PresenceStack({ viewers }: { viewers: string[] }) {
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
      className="border-hairline bg-surface rounded-control flex items-center gap-1.5 border py-1 pr-2 pl-1.5"
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

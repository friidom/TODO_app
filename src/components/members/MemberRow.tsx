import MemberActions from "./MemberActions";
import MemberIdentity from "./MemberIdentity";
import { roleLabel, roleStyle } from "./roleStyles";
import type { BoardMember } from "@/services/members/membersApi";
import { cn } from "@/utils/cn";

// Renders only what board_roster returns — no email, no bio. The RPC's return list is the exposure boundary.
export default function MemberRow({
  member,
  isCurrentUser = false,
}: {
  member: BoardMember;
  isCurrentUser?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 transition-colors",
        isCurrentUser ? "bg-brand-soft/40" : "hover:bg-ink/5",
      )}
    >
      <MemberIdentity
        member={member}
        suffix={
          isCurrentUser ? (
            <span className="text-ink-3 font-normal"> (You)</span>
          ) : null
        }
      />

      <span
        className={cn(
          "text-micro shrink-0 rounded px-1.5 py-0.5 font-semibold tracking-wide uppercase",
          roleStyle(member.role),
        )}
      >
        {roleLabel(member.role)}
      </span>

      <MemberActions member={member} />
    </li>
  );
}

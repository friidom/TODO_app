import MemberActions from "./MemberActions";
import MemberIdentity from "./MemberIdentity";
import { roleLabel, roleStyle } from "./roleStyles";
import type { BoardMember } from "@/services/members/membersApi";
import { cn } from "@/utils/cn";

/**
 * One member of a board, in the context rail.
 *
 * Renders only what `board_roster` returns — `id`, `username`, `full_name`,
 * `avatar_url`, `role`, `joined_at`. There is no `email` and no `bio` to fall
 * back to, deliberately: the RPC's return list is the exposure boundary, so a
 * field that is not here is a field the database will not give the client.
 */

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

      {/* Renders nothing unless this caller may act on this member, so the
          Owner's row and a viewer's view of any row carry no control at all. */}
      <MemberActions member={member} />
    </li>
  );
}

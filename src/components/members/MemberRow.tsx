import MemberIdentity from "./MemberIdentity";
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

/**
 * Role → badge colour, from the existing accent tokens.
 *
 * Owner takes the brand purple because it is the one role no control can
 * change. Keyed off a plain `string` because that is what the column is — a
 * checked text field, not an enum — and an unrecognised value falls through to
 * the neutral style rather than rendering nothing.
 */
const ROLE_STYLES: Record<string, string> = {
  owner: "bg-brand-soft text-brand",
  admin: "bg-status-blue/15 text-status-blue",
  editor: "bg-status-green/15 text-status-green",
  viewer: "bg-ink/10 text-ink-2",
};

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

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
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
          ROLE_STYLES[member.role] ?? "bg-ink/10 text-ink-2",
        )}
      >
        {roleLabel(member.role)}
      </span>
    </li>
  );
}

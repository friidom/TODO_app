import type { BoardMember } from "@/services/members/membersApi";

/**
 * Display fallbacks for a roster row.
 *
 * Split out of `MemberIdentity.tsx` rather than exported beside it: react-refresh
 * cannot fast-refresh a module that mixes a component with other exports, which
 * is the same reason `providers/themeContext.ts` and `providers/authContext.ts`
 * are their own files.
 *
 * All three name fields are nullable in `profiles`, and `board_roster` returns
 * no `email` to fall back to — deliberately, since its return list is the
 * exposure boundary.
 */

/** First letter of whatever name exists, for the avatar fallback. */
export function memberInitial(member: BoardMember) {
  const source = member.full_name || member.username;

  return source ? source.charAt(0).toUpperCase() : "?";
}

/** The name to show. `full_name`, else `username`, else a neutral stand-in. */
export function memberName(member: BoardMember) {
  return member.full_name || member.username || "Unnamed member";
}

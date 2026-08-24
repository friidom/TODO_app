import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberInitial, memberName } from "./memberLabels";
import type { BoardMember } from "@/services/members/membersApi";
import { cn } from "@/utils/cn";

/**
 * A member's avatar and name, as the roster gives them.
 *
 * Shared by the rail's `MemberRow` and the card's assignee picker so the
 * fallback rules live in one place. All three fields are nullable in
 * `profiles`, and there is no `email` to fall back to — the `board_roster` RPC
 * does not return one, deliberately.
 */

export default function MemberIdentity({
  member,
  suffix,
  size = "sm",
}: {
  member: BoardMember;
  /** Rendered after the name — the rail uses it for "(You)". */
  suffix?: ReactNode;
  size?: "sm" | "default";
}) {
  const primary = memberName(member);

  // Suppressed when it would merely repeat the line above, which is what
  // happens for a member with a username and no full name.
  const secondary =
    member.username && member.username !== primary
      ? `@${member.username}`
      : null;

  return (
    <>
      <Avatar size={size}>
        {/* base-ui falls back on its own when src is empty or the image fails,
            so a broken avatar_url is covered as well as a null one. */}
        <AvatarImage src={member.avatar_url ?? undefined} alt="" />
        <AvatarFallback
          className={cn(
            "bg-ink/10 text-ink-2 font-semibold",
            size === "sm" ? "text-micro" : "text-xs",
          )}
        >
          {memberInitial(member)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 text-left">
        <p className="text-ink text-meta truncate leading-tight font-medium">
          {primary}
          {suffix}
        </p>

        {secondary && (
          <p className="text-ink-3 text-mini truncate leading-tight">
            {secondary}
          </p>
        )}
      </div>
    </>
  );
}

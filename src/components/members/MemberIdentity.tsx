import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberInitial, memberName } from "./memberLabels";
import type { BoardMember } from "@/services/members/membersApi";
import { cn } from "@/utils/cn";

export default function MemberIdentity({
  member,
  suffix,
  size = "sm",
}: {
  member: BoardMember;
  suffix?: ReactNode;
  size?: "sm" | "default";
}) {
  const primary = memberName(member);

  const secondary =
    member.username && member.username !== primary
      ? `@${member.username}`
      : null;

  return (
    <>
      <Avatar size={size}>
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

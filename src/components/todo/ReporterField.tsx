import { useTranslation } from "react-i18next";
import { UserIcon } from "lucide-react";

import { memberInitial, memberName } from "@/components/members/memberLabels";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useBoardMembers } from "@/services/members/useBoardMembers";

// Read-only: who created the work item. Someone who has since left the board is
// named as a former member rather than resolved through another lookup.
export default function ReporterField({
  boardId,
  creatorId,
}: {
  boardId: string;
  creatorId: string | null;
}) {
  const { t } = useTranslation();
  const { data: members, isPending } = useBoardMembers(boardId);

  if (!creatorId) {
    return <span className="text-ink-3 text-meta">{t("common.none")}</span>;
  }

  const reporter = members?.find((member) => member.id === creatorId);

  if (!reporter) {
    return (
      <span className="text-ink-3 text-meta flex items-center gap-2">
        <span className="bg-ink/10 grid size-6 place-items-center rounded-full">
          <UserIcon className="size-3" />
        </span>
        {isPending ? "…" : t("members.former")}
      </span>
    );
  }

  return (
    <span className="text-ink text-meta flex min-w-0 items-center gap-2">
      <Avatar size="sm">
        <AvatarImage src={reporter.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-ink/10 text-ink-2 text-micro font-semibold">
          {memberInitial(reporter)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{memberName(reporter)}</span>
    </span>
  );
}

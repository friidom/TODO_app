import { useTranslation } from "react-i18next";
import { useState } from "react";
import { UserPlusIcon } from "lucide-react";

import InvitePeopleModal from "@/components/invites/InvitePeopleModal";
import { SearchField } from "@/components/board/FilterPopover";
import MemberRow from "@/components/members/MemberRow";
import { memberName } from "@/components/members/memberLabels";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/services/auth/useAuth";
import { useBoardMembers } from "@/services/members/useBoardMembers";

export default function MembersDrawer({ boardId }: { boardId: string }) {
  const { t } = useTranslation();
  const { data: members, isPending, error } = useBoardMembers(boardId);
  const { user } = useAuth();
  const { canManageMembers } = usePermissions(boardId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? members?.filter(
        (member) =>
          memberName(member).toLowerCase().includes(needle) ||
          member.username?.toLowerCase().includes(needle),
      )
    : members;
  const membersLabel = t("board.members").toLowerCase();

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={t("filter.searchPlaceholder", { name: membersLabel })}
            label={t("filter.search", { name: membersLabel })}
          />
        </div>

        {canManageMembers && (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="bg-brand text-brand-fg rounded-control focus-visible:ring-brand/40 text-meta flex h-8 shrink-0 items-center gap-1.5 px-3 font-medium transition-opacity outline-none hover:opacity-90 focus-visible:ring-2"
          >
            <UserPlusIcon className="size-4" />
            {t("members.addPeople")}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isPending && (
          <div className="space-y-3 px-2 pt-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-10 shrink-0" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="border-status-red/30 text-status-red rounded-card mx-2 border border-dashed px-3 py-4 text-xs leading-relaxed">
            {t("assignee.loadFailed")} {error.message}
          </p>
        )}

        {members?.length === 0 && (
          <p className="text-ink-3 text-meta px-2 py-6 text-center">
            {t("members.none")}
          </p>
        )}

        {!!members?.length && (
          <p className="text-ink-3 text-mini px-2 pb-1.5 font-medium">
            {needle
              ? t("filter.shownOf", {
                  shown: shown?.length ?? 0,
                  total: members.length,
                })
              : t("members.count", { count: members.length })}
          </p>
        )}

        {!!members?.length && shown?.length === 0 && (
          <p className="text-ink-3 text-meta px-2 py-6 text-center">
            {t("common.nothingMatches", { query: query.trim() })}
          </p>
        )}

        {!!shown?.length && (
          <ul className="space-y-px">
            {shown.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isCurrentUser={member.id === user?.id}
              />
            ))}
          </ul>
        )}
      </div>

      <InvitePeopleModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        boardId={boardId}
      />
    </div>
  );
}

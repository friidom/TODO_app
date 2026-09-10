import { useState } from "react";
import { UserPlusIcon } from "lucide-react";

import InvitePeopleModal from "@/components/invites/InvitePeopleModal";
import MemberRow from "@/components/members/MemberRow";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/services/auth/useAuth";
import { useBoardMembers } from "@/services/members/useBoardMembers";

export default function MembersDrawer({ boardId }: { boardId: string }) {
  const { data: members, isPending, error } = useBoardMembers(boardId);
  const { user } = useAuth();
  const { canManageMembers } = usePermissions(boardId);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      {canManageMembers && (
        <div className="border-hairline shrink-0 border-b p-3">
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="border-hairline text-ink-2 hover:border-brand/40 hover:bg-brand-soft hover:text-brand rounded-control flex h-9 w-full items-center justify-center gap-2 border border-dashed text-sm font-medium transition-colors"
          >
            <UserPlusIcon className="size-4" />
            Add people
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isPending && (
          <div className="space-y-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Skeleton className="size-6 shrink-0 rounded-full" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-10 shrink-0" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="border-status-red/30 text-status-red rounded-card border border-dashed px-3 py-4 text-xs leading-relaxed">
            Could not load members. {error.message}
          </p>
        )}

        {members?.length === 0 && (
          <p className="border-hairline text-ink-3 rounded-card border border-dashed px-3 py-4 text-xs leading-relaxed">
            No members to show.
          </p>
        )}

        {!!members?.length && (
          <ul className="divide-hairline border-hairline bg-surface/40 rounded-card divide-y overflow-hidden border">
            {members.map((member) => (
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
      />
    </div>
  );
}

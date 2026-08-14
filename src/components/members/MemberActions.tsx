import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { roleLabel } from "./roleStyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/usePermissions";
import type { BoardMember } from "@/services/members/membersApi";
import {
  assignableRoles,
  canActOnMember,
} from "@/services/members/permissions";
import {
  useRemoveMember,
  useUpdateMemberRole,
} from "@/services/members/useMemberMutations";

/**
 * Change a member's role, or remove them.
 *
 * **Renders nothing at all when the actor may not act on this member** — no
 * disabled trigger, no greyed menu. The Owner's row is the case that matters:
 * the plan is explicit that the UI should not offer a control with no
 * explanation for the one role no control can change. `canActOnMember` is what
 * decides, and it refuses the Owner before it looks at rank, so this is absent
 * on that row for every caller including the Owner themselves.
 *
 * The options come from `assignableRoles`, so an admin sees viewer and editor
 * and an owner also sees admin — and neither is ever offered `owner`, because
 * ownership is not grantable through membership management. Nothing here
 * re-derives those rules; both come from `permissions.ts`.
 *
 * Removal confirms inline rather than through `window.confirm`, which blocks
 * the event loop — the same pattern `PendingInviteRow` uses, so destructive
 * confirmation looks the same wherever it appears.
 */
export default function MemberActions({ member }: { member: BoardMember }) {
  const [open, setOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const { role: actorRole } = usePermissions();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  if (!canActOnMember(actorRole, member.role)) return null;

  const options = assignableRoles(actorRole);

  function close() {
    setOpen(false);
    setConfirmingRemove(false);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmingRemove(false);
      }}
    >
      <DropdownMenuTrigger
        aria-label={`Manage ${member.username ?? "member"}`}
        className="text-ink-3 hover:bg-ink/10 hover:text-ink focus-visible:ring-brand shrink-0 rounded p-1 outline-none focus-visible:ring-2"
      >
        <MoreHorizontal size={15} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuRadioGroup
          value={member.role}
          onValueChange={(next) => {
            // Selecting the role they already hold is a write that changes
            // nothing; skip it rather than round-trip.
            if (next !== member.role) {
              updateRole.mutate({ userId: member.id, role: next });
            }
            close();
          }}
        >
          <DropdownMenuLabel>Role</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {roleLabel(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        {confirmingRemove ? (
          <DropdownMenuItem
            onClick={() => {
              removeMember.mutate({ userId: member.id });
              close();
            }}
            className="text-status-red font-medium"
          >
            Confirm remove
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setConfirmingRemove(true)}
            className="text-status-red"
          >
            Remove from board
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

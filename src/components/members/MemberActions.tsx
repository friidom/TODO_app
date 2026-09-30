import { useTranslation } from "react-i18next";
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

// renders nothing at all when the actor can't act on this member — no disabled trigger, just absent (owner's row, always)
export default function MemberActions({ member }: { member: BoardMember }) {
  const { t } = useTranslation();
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
        aria-label={t("members.manage", {
          name: member.username ?? t("members.member"),
        })}
        className="text-ink-3 hover:bg-ink/10 hover:text-ink focus-visible:ring-brand shrink-0 rounded p-1 outline-none focus-visible:ring-2"
      >
        <MoreHorizontal size={15} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuRadioGroup
          value={member.role}
          onValueChange={(next) => {
            if (next !== member.role) {
              updateRole.mutate({ userId: member.id, role: next });
            }
            close();
          }}
        >
          <DropdownMenuLabel>{t("activity.role")}</DropdownMenuLabel>
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
            {t("members.confirmRemove")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setConfirmingRemove(true)}
            className="text-status-red"
          >
            {t("members.remove")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

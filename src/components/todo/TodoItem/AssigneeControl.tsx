import { useTranslation } from "react-i18next";
import { CheckIcon, UserIcon, UserMinusIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import MemberIdentity from "@/components/members/MemberIdentity";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  MENU_ITEM,
  MENU_LABEL,
  MENU_SEPARATOR,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { Skeleton } from "@/components/ui/skeleton";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { cn } from "@/utils/cn";
import {
  FIELD_CELL,
  FIELD_EMPTY,
  HOVER_REVEAL,
  OPTION_ITEM,
} from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

export default function AssigneeControl({
  boardId,
  value: assigneeId,
  onChange,
  alwaysVisible = false,
  showName = false,
  variant,
}: {
  boardId: string;
  value: string | null;
  onChange: (value: string | null) => void;
  alwaysVisible?: boolean;
  // avatar + name for a labelled field row; the avatar alone stays the default for cards
  showName?: boolean;
  variant?: "cell";
}) {
  const { t } = useTranslation();
  const { mounted, close, triggerProps, panelProps } = useCardPopover();

  const { data: members } = useBoardMembers(boardId);
  const assignee = members?.find((member) => member.id === assigneeId) ?? null;

  const label = assignee
    ? t("assignee.assignedTo", { name: memberName(assignee) })
    : t("assignee.assign");

  const cell = variant === "cell";
  const named = showName || cell;

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={label}
        aria-label={label}
        className={cn(
          cell
            ? FIELD_CELL
            : showName
              ? "text-meta hover:bg-wash-strong focus-visible:ring-brand rounded-control -mx-1.5 flex h-8 min-w-0 items-center gap-2 px-1.5 transition-colors outline-none focus-visible:ring-2"
              : "focus-visible:ring-brand shrink-0 rounded-full transition-opacity duration-150 outline-none focus-visible:ring-2",
          !named && !assigneeId && !alwaysVisible && HOVER_REVEAL,
        )}
      >
        {assignee ? (
          <Avatar size="sm">
            <AvatarImage src={assignee.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-ink/10 text-ink-2 text-micro font-semibold">
              {memberInitial(assignee)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150",
              cell
                ? "bg-ink/10 text-ink-2"
                : cn(FIELD_EMPTY, assigneeId && "border-solid"),
            )}
          >
            <UserIcon className={cell ? "size-3.5" : "size-3"} />
          </span>
        )}
        {named && (
          <span
            className={cn(
              "truncate",
              assignee ? "text-ink" : cell ? "text-ink-2" : "text-ink-3",
            )}
          >
            {assignee ? memberName(assignee) : t("members.unassigned")}
          </span>
        )}
      </button>

      {mounted && (
        <FloatingPortal>
          <div {...panelProps} className={cn(POPOVER_PANEL, "z-50 w-60")}>
            <p className={MENU_LABEL}>{t("fields.assignee")}</p>

            <MemberList
              boardId={boardId}
              assigneeId={assigneeId}
              onSelect={(next) => {
                onChange(next);
                close();
              }}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function MemberList({
  boardId,
  assigneeId,
  onSelect,
}: {
  boardId: string;
  assigneeId: string | null;
  onSelect: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data: members, isPending, error } = useBoardMembers(boardId);

  const assign = onSelect;

  if (isPending) {
    return (
      <div className="space-y-1 p-1" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2.5 px-1 py-1">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-status-red text-meta px-2 py-2">
        {t("assignee.loadFailed")}
      </p>
    );
  }

  if (members.length === 0) {
    return (
      <p className="text-ink-3 text-meta px-2 py-2">
        {t("assignee.noMembers")}
      </p>
    );
  }

  return (
    <>
      <ul className="max-h-64 overflow-y-auto">
        {members.map((member) => {
          const selected = member.id === assigneeId;

          return (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => assign(selected ? null : member.id)}
                className={cn(OPTION_ITEM, "gap-2.5")}
              >
                <MemberIdentity member={member} />

                {selected && <CheckIcon className="text-brand size-4" />}
              </button>
            </li>
          );
        })}
      </ul>

      {assigneeId && (
        <>
          <div className={MENU_SEPARATOR} />

          <button
            type="button"
            onClick={() => assign(null)}
            className={MENU_ITEM}
          >
            <UserMinusIcon />
            {t("assignee.unassign")}
          </button>
        </>
      )}
    </>
  );
}

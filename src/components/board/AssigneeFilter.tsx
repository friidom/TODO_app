import { useTranslation } from "react-i18next";
import { FloatingPortal } from "@floating-ui/react";
import { UserRoundIcon } from "lucide-react";

import FilterOptionRow from "./FilterOptionRow";
import ToolbarButton from "./ToolbarButton";
import { useFilterPopover } from "./useFilterPopover";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { POPOVER_PANEL } from "@/components/ui/controlChrome";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBoardId } from "@/hooks/useBoardId";
import type { BoardView } from "@/hooks/useBoardView";
import { useAuth } from "@/services/auth/useAuth";
import type { BoardMember } from "@/services/members/membersApi";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { FILTER_LABELS, ME, UNSET } from "@/services/todos/view";
import { cn } from "@/utils/cn";

// Past this the row would crowd the search box out; the rest sit behind the +N chip.
const SHOWN = 3;

// ring-canvas is the gap that separates overlapping avatars; a pressed one swaps it for the brand ring.
const TOGGLE =
  "focus-visible:ring-brand relative rounded-full ring-2 ring-canvas transition-transform duration-150 outline-none hover:z-10 hover:-translate-y-0.5 focus-visible:z-10";

const TOGGLE_PRESSED = "ring-brand z-10";

// Quick filters over the Assignee filter the Filter popover already owns — same URL values, so the two always agree.
// "You" is ME rather than the user's id, which is what the popover's "Assigned to me" row writes.
export default function AssigneeFilter({ view }: { view: BoardView }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: members = [] } = useBoardMembers(useBoardId());

  if (members.length === 0) return null;

  const selected = view.filters.assignee;
  const me = members.find((member) => member.id === user?.id);
  const others = members.filter((member) => member.id !== user?.id);
  const visible = others.slice(0, SHOWN);
  const rest = others.slice(SHOWN);

  return (
    <div
      role="group"
      aria-label={t("filter.by", { name: FILTER_LABELS.assignee })}
      className="hidden items-center -space-x-1.5 @4xl:flex"
    >
      <AvatarToggle
        label={t("members.unassigned")}
        pressed={selected.includes(UNSET)}
        onClick={() => view.toggleFilter("assignee", UNSET)}
      >
        <span className="bg-wash-strong text-ink-3 grid size-8 place-items-center rounded-full">
          <UserRoundIcon className="size-4" />
        </span>
      </AvatarToggle>

      {me && (
        <AvatarToggle
          label={t("members.assignedToMe")}
          pressed={selected.includes(ME)}
          onClick={() => view.toggleFilter("assignee", ME)}
        >
          <MemberAvatar member={me} />
        </AvatarToggle>
      )}

      {visible.map((member) => (
        <AvatarToggle
          key={member.id}
          label={memberName(member)}
          pressed={selected.includes(member.id)}
          onClick={() => view.toggleFilter("assignee", member.id)}
        >
          <MemberAvatar member={member} />
        </AvatarToggle>
      ))}

      {rest.length > 0 && (
        <MoreAssignees members={rest} everyone={members} view={view} />
      )}
    </div>
  );
}

function MemberAvatar({ member }: { member: BoardMember }) {
  return (
    <Avatar>
      <AvatarImage src={member.avatar_url ?? undefined} alt="" />
      <AvatarFallback className="bg-elevated text-ink-2 text-xs font-semibold">
        {memberInitial(member)}
      </AvatarFallback>
    </Avatar>
  );
}

function AvatarToggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-pressed={pressed}
        aria-label={label}
        onClick={onClick}
        className={cn(TOGGLE, pressed && TOGGLE_PRESSED)}
      >
        {children}
      </TooltipTrigger>

      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function MoreAssignees({
  members,
  everyone,
  view,
}: {
  members: BoardMember[];
  everyone: BoardMember[];
  view: BoardView;
}) {
  const { t } = useTranslation();
  const { mounted, triggerProps, panelProps } = useFilterPopover();

  const selected = view.filters.assignee;
  const pressed = members.some((member) => selected.includes(member.id));

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        aria-haspopup="dialog"
        aria-label={t("filter.moreAssignees")}
        title={t("filter.moreAssignees")}
        className={cn(
          TOGGLE,
          "bg-elevated text-ink-2 text-micro grid h-8 min-w-8 shrink-0 place-items-center px-1.5 font-semibold tabular-nums",
          pressed && TOGGLE_PRESSED,
        )}
      >
        +{members.length}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="dialog"
            aria-label={t("filter.moreAssignees")}
            className={cn(
              POPOVER_PANEL,
              "z-50 max-h-72 w-60 overflow-y-auto p-1.5",
            )}
          >
            {members.map((member, index) => (
              <FilterOptionRow
                key={member.id}
                option={{ value: member.id, label: memberName(member) }}
                category="assignee"
                members={everyone}
                statuses={[]}
                checked={selected.includes(member.id)}
                onToggle={() => view.toggleFilter("assignee", member.id)}
                autoFocus={index === 0}
              />
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// Clears the filters only — search has its own clear — which is what its label says.
export function ClearFiltersButton({ view }: { view: BoardView }) {
  const { t } = useTranslation();

  if (view.filterCount === 0) return null;

  return (
    <ToolbarButton
      label={t("view.clearFilters")}
      icon={null}
      onClick={view.clearFilters}
      className="hidden @xl:flex"
    />
  );
}

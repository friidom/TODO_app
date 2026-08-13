import { ListFilterIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import MemberIdentity from "@/components/members/MemberIdentity";
import { categoryOf, columnTitle } from "@/constants/columns";
import { PRIORITIES, PRIORITY_OPTIONS } from "@/constants/priorities";
import { WORK_TYPE_OPTIONS, workTypeOf } from "@/constants/workTypes";
import { useBoardId } from "@/hooks/useBoardId";
import type { BoardView } from "@/hooks/useBoardView";
import { useAuth } from "@/services/auth/useAuth";
import { useColumns } from "@/services/columns/useColumnsApi";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import {
  DUE_BUCKETS,
  DUE_LABELS,
  ME,
  UNSET,
  type FilterCategory,
} from "@/services/todos/view";
import { cn } from "@/utils/cn";
import { byPosition } from "@/utils/position";
import {
  HEADER_CONTROL,
  HEADER_CONTROL_ACTIVE,
  HEADER_CONTROL_BADGE,
} from "./headerControl";

/**
 * Narrow the board to the work you care about.
 *
 * Five dimensions, all of them fields the schema already has: assignee, work
 * type, priority, due date and status. **AND between sections, OR inside one** —
 * "Bug or Story, assigned to me" is the question people actually ask, and
 * "Bug and Story" would always be empty. A section with nothing ticked is off,
 * not excluding everything, which is what makes unticking your last box show the
 * board again rather than emptying it.
 *
 * Filtering runs client-side over the loaded board array, which is the decision
 * `docs/IMPLEMENTATION_PLAN.md` M12 already recorded. Nothing here queries.
 *
 * Deliberately not a filter *builder*. There is no field picker, no operator, no
 * saved query — five sections of checkboxes answer the question a board is
 * asked, and the ceiling on that is a product decision to revisit, not a
 * limitation to design around now.
 */
export default function BoardFilters({ view }: { view: BoardView }) {
  const boardId = useBoardId();
  const { user } = useAuth();
  const { data: columns = [] } = useColumns();
  const { data: members = [] } = useBoardMembers(boardId);

  const { filters, filterCount, toggleFilter, clearFilters } = view;

  const orderedColumns = columns.slice().sort(byPosition);

  // The signed-in user is offered once, as "Assigned to me". Listing them again
  // by name would be two checkboxes for one person that have to be kept in
  // agreement — and the roster row is the redundant one, since a shared URL is
  // meant to mean "assigned to whoever opened it".
  const others = members.filter((member) => member.id !== user?.id);

  const item = (
    category: FilterCategory,
    value: string,
    children: ReactNode,
  ) => (
    <DropdownMenuCheckboxItem
      key={`${category}:${value}`}
      checked={filters[category].includes(value)}
      onCheckedChange={() => toggleFilter(category, value)}
    >
      {children}
    </DropdownMenuCheckboxItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={filterCount ? `Filter — ${filterCount} active` : "Filter"}
        className={cn(HEADER_CONTROL, filterCount > 0 && HEADER_CONTROL_ACTIVE)}
      >
        <ListFilterIcon className="size-4" />
        <span className="hidden md:inline">Filter</span>
        {filterCount > 0 && (
          <span className={HEADER_CONTROL_BADGE}>{filterCount}</span>
        )}
      </DropdownMenuTrigger>

      {/* The vendored content sizes itself to the trigger via `w-(--anchor-width)`,
          which would be a 90px filter panel. `max-h-(--available-height)` and its
          own overflow are already on it, so a long roster scrolls rather than
          running off the viewport. */}
      {/* Each section is a real `Menu.Group`. `DropdownMenuLabel` is Base UI's
          `Menu.GroupLabel`, which reads `MenuGroupContext` to register itself as
          the group's accessible name — outside a group that context is missing
          and it throws. The wrapper is a bare `<div role="group">`, so nothing
          about the panel's layout changes. Separators stay between the groups,
          where their negative margins still reach the popup's padding. */}
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Assignee</DropdownMenuLabel>
          {item("assignee", ME, "Assigned to me")}
          {item("assignee", UNSET, "Unassigned")}
          {others.map((member) =>
            item(
              "assignee",
              member.id,
              <span className="flex min-w-0 items-center gap-2">
                <MemberIdentity member={member} size="sm" />
              </span>,
            ),
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Work type</DropdownMenuLabel>
          {WORK_TYPE_OPTIONS.map((type) => {
            const meta = workTypeOf(type);
            const Icon = meta.icon;

            return item(
              "type",
              type,
              <>
                <Icon className={cn("size-4 shrink-0", meta.tone)} />
                {type}
              </>,
            );
          })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Priority</DropdownMenuLabel>
          {PRIORITY_OPTIONS.map((priority) => {
            const meta = PRIORITIES[priority];
            const Icon = meta.icon;

            return item(
              "priority",
              priority,
              <>
                <Icon className={cn("size-4 shrink-0", meta.tone)} />
                {meta.label}
              </>,
            );
          })}
          {item("priority", UNSET, "No priority")}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Due date</DropdownMenuLabel>
          {DUE_BUCKETS.map((bucket) =>
            item(
              "due",
              bucket,
              <span className={cn(bucket === "overdue" && "text-status-red")}>
                {DUE_LABELS[bucket]}
              </span>,
            ),
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          {orderedColumns.map((column) =>
            item(
              "status",
              column.id,
              <>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    categoryOf(column.category).dot,
                  )}
                />
                <span className="min-w-0 truncate">
                  {columnTitle(column.title)}
                </span>
              </>,
            ),
          )}
        </DropdownMenuGroup>

        {/* Only offered when there is something to clear — a permanently
            visible "Clear filters" on an unfiltered board is a button that
            does nothing. */}
        {filterCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={clearFilters}>
              Clear filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

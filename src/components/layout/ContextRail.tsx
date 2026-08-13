import { ActivityIcon, FilterIcon, UsersIcon } from "lucide-react";

import MemberRow from "@/components/members/MemberRow";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/services/auth/useAuth";
import { useBoardMembers } from "@/services/members/useBoardMembers";

/**
 * The contextual right rail: Members, Activity, Quick Filters.
 *
 * **Members is live.** It reads the `board_roster` RPC through
 * `useBoardMembers` — never `board_members` directly, which is self-read only
 * and would return a one-person list with no error to signal it. Activity and
 * Quick Filters are still containers with nothing behind them; each fills in
 * with its own feature.
 *
 * Hidden below `xl` rather than collapsed to a strip: at that width the board
 * needs the room more than the rail does.
 */
export default function ContextRail({ boardId }: { boardId: string }) {
  return (
    <aside className="border-hairline bg-rail/50 hidden w-72 shrink-0 overflow-y-auto border-l xl:block">
      <Panel icon={UsersIcon} title="Members" action="Manage">
        <MembersPanel boardId={boardId} />
      </Panel>

      <Panel icon={ActivityIcon} title="Activity" action="View all">
        <Placeholder>Recent changes to this board will stream here.</Placeholder>
      </Panel>

      <Panel icon={FilterIcon} title="Quick Filters">
        <Placeholder>Saved filters will live here.</Placeholder>
      </Panel>
    </aside>
  );
}

function MembersPanel({ boardId }: { boardId: string }) {
  const { data: members, isPending, error } = useBoardMembers(boardId);
  const { user } = useAuth();

  if (isPending) {
    return (
      <div className="space-y-2 px-3 py-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-10 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Placeholder tone="error">
        Could not load members. {error.message}
      </Placeholder>
    );
  }

  // An empty roster is a real answer, not a failure: board_roster returns an
  // empty set to a non-member rather than raising, so this is also what someone
  // who has lost access sees.
  if (members.length === 0) {
    return <Placeholder>No members to show.</Placeholder>;
  }

  return (
    <ul className="divide-hairline border-hairline bg-surface/40 divide-y overflow-hidden rounded-card border">
      {members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          isCurrentUser={member.id === user?.id}
        />
      ))}
    </ul>
  );
}

/**
 * A panel's empty/placeholder body.
 *
 * Split out of `Panel` so the panel itself wraps children in a neutral `div`.
 * It used to force every child into a `<p>`, which made a `<ul>` of members
 * invalid HTML — a block element inside a paragraph closes the paragraph, so
 * the browser silently restructures the DOM around it.
 */
function Placeholder({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <p
      className={
        tone === "error"
          ? "border-status-red/30 text-status-red rounded-card border border-dashed px-3 py-4 text-xs leading-relaxed"
          : "border-hairline text-ink-3 rounded-card border border-dashed px-3 py-4 text-xs leading-relaxed"
      }
    >
      {children}
    </p>
  );
}

function Panel({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof UsersIcon;
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-hairline border-b p-4 last:border-b-0">
      <header className="mb-3 flex items-center gap-2">
        <Icon className="text-ink-3 size-4" />
        <h2 className="text-ink text-sm font-semibold">{title}</h2>

        {action && (
          <button
            type="button"
            disabled
            title={`${action} — not built yet`}
            className="text-brand ml-auto text-xs font-medium disabled:cursor-default disabled:opacity-60"
          >
            {action}
          </button>
        )}
      </header>

      <div>{children}</div>
    </section>
  );
}

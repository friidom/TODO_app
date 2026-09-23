import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { ArrowLeftIcon, Loader2 } from "lucide-react";

import { useBoardId } from "@/hooks/useBoardId";
import { usePermissions } from "@/hooks/usePermissions";
import { useBoard } from "@/services/boards/useBoard";
import {
  boardSettingsPath,
  boardSettingsSections,
} from "@/services/boardSettings/registry";
import EmptyState from "@/components/ui/EmptyState";
import { cn } from "@/utils/cn";

// Outside the app shell, for the reason ProfilePage records about settings:
// "a place you finish with and leave, not a workspace view". The way back is
// the board itself, named, rather than the sidebar.
// No `section` prop: NavLink derives the active item from the URL, so passing
// it would be a second source of truth for the same answer.
export default function BoardSettingsShell({
  children,
}: {
  children: ReactNode;
}) {
  const boardId = useBoardId();
  const { data: board, isPending } = useBoard(boardId);
  const { canEditBoard, isLoading } = usePermissions(boardId);
  const navigate = useNavigate();

  const title = board?.title || "Untitled board";

  // Everything is false while permissions load, deliberately — the same rule
  // usePermissions states — so this waits rather than flashing a refusal.
  if (isPending || isLoading) {
    return (
      <div className="bg-canvas grid h-svh place-items-center">
        <Loader2 className="text-ink-3 size-5 animate-spin" />
      </div>
    );
  }

  if (!canEditBoard) {
    return (
      <div className="bg-canvas grid h-svh place-items-center px-5">
        <EmptyState
          icon={ArrowLeftIcon}
          title="You can't change this board's settings"
          hint="Board settings are open to admins and the board's owner."
          action={{
            label: "Back to board",
            run: () => void navigate(`/boards/${boardId}`),
          }}
        />
      </div>
    );
  }

  return (
    <div className="bg-canvas flex h-svh flex-col overflow-hidden">
      <header className="border-hairline flex min-h-12 shrink-0 items-center border-b px-5 md:px-6">
        <Link
          to={`/boards/${boardId}`}
          className="border-hairline text-ink-2 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control text-meta flex h-8 items-center gap-1.5 border px-2.5 transition-colors outline-none focus-visible:ring-2"
        >
          <ArrowLeftIcon className="size-3.5 shrink-0" />
          <span className="max-w-40 truncate">{title}</span>
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8 md:flex-row md:gap-8 md:px-6">
          <nav
            aria-label="Board settings"
            className="shrink-0 md:w-52 md:pt-1"
          >
            <p className="text-ink-3 text-mini mb-1 font-semibold tracking-[0.1em] uppercase">
              Board settings
            </p>

            <p className="text-ink mb-3 truncate text-sm font-semibold">
              {title}
            </p>

            {/* Row, not column, below md — a vertical rail on a phone would
                push the content it labels off the first screen. */}
            <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              {boardSettingsSections().map((definition) => (
                <li key={definition.section}>
                  <NavLink
                    to={boardSettingsPath(boardId ?? "", definition.section)}
                    className={({ isActive }) =>
                      cn(
                        "rounded-control text-meta relative block shrink-0 px-2.5 py-1.5 transition-colors md:pl-3",
                        isActive
                          ? "bg-brand-soft text-ink before:bg-brand font-medium md:before:absolute md:before:top-1/2 md:before:left-0 md:before:h-4 md:before:w-0.5 md:before:-translate-y-1/2 md:before:rounded-r-full"
                          : "text-ink-2 hover:bg-wash hover:text-ink",
                      )
                    }
                  >
                    {definition.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Lifted from ProfilePage rather than re-invented, so the two settings surfaces
// in the app look like one. Exported because both settings pages use them.
export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-hairline bg-surface rounded-surface mb-4 border">
      <div className="border-hairline border-b px-5 py-3">
        <h2 className="text-ink-3 text-mini font-semibold tracking-[0.1em] uppercase">
          {title}
        </h2>

        {hint && <p className="text-ink-3 mt-1 text-xs">{hint}</p>}
      </div>

      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-ink-2 text-meta mb-1.5 block font-medium">
        {label}
      </span>

      {children}

      {hint && <span className="text-ink-3 mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

// Label and hint left, control right — the feature-toggle row.
export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-medium">{label}</p>
        <p className="text-ink-3 text-xs">{hint}</p>
      </div>

      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

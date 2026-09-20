import type { ReactNode } from "react";
import { ArrowLeftIcon, ShieldIcon } from "lucide-react";
import { Link, NavLink } from "react-router";

import { adminSections } from "@/services/admin/registry";
import { cn } from "@/utils/cn";
import PeriodSelector from "./PeriodSelector";

export default function AdminShell({
  title,
  hint,
  actions,
  showPeriod = true,
  busy = false,
  children,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  showPeriod?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="bg-canvas min-h-dvh">
      <header className="border-hairline bg-surface/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-350 flex-col gap-3 px-4 pt-3 sm:px-6">
          {/* The way out, once in the shared shell so it sits in the same
              place on every admin screen. A route link and not history.back(),
              which does nothing when the page was opened from a deep link. */}
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="text-ink-3 hover:text-ink hover:bg-wash rounded-control text-mini -ml-1.5 flex items-center gap-1.5 px-1.5 py-1 transition-colors"
            >
              <ArrowLeftIcon className="size-3.5 shrink-0" />
              Back to boards
            </Link>

            <span className="text-ink-3/50 text-mini" aria-hidden>
              /
            </span>

            <span className="text-ink-3 text-mini flex items-center gap-1.5">
              <ShieldIcon className="size-3.5 shrink-0" />
              Superadmin
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-ink truncate text-base font-semibold tracking-tight">
                {title}
              </h1>

              <p className="text-ink-3 text-mini mt-0.5 flex items-center gap-2">
                <span className="min-w-0 truncate">{hint}</span>

                {/* Said out loud rather than left silent: a period switch
                    still in flight must not read as a finished answer. */}
                {busy && (
                  <span className="text-brand shrink-0" role="status">
                    updating…
                  </span>
                )}
              </p>
            </div>

            {actions}
            {showPeriod && <PeriodSelector />}
          </div>

          <nav
            aria-label="Superadmin sections"
            className="-mb-px flex gap-0.5 overflow-x-auto"
          >
            {adminSections().map((section) => (
              <NavLink
                key={section.section}
                to={section.path}
                end={section.path === "/admin"}
                className={({ isActive }) =>
                  cn(
                    "text-ink-3 hover:text-ink text-meta shrink-0 border-b-2 border-transparent px-2.5 pb-2.5 transition-colors",
                    isActive && "border-brand text-ink font-medium",
                  )
                }
              >
                {section.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-350 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}

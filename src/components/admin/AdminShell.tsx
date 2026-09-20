import type { ReactNode } from "react";
import { NavLink } from "react-router";

import { adminSections } from "@/services/admin/registry";
import { cn } from "@/utils/cn";
import PeriodSelector from "./PeriodSelector";

export default function AdminShell({
  title,
  hint,
  actions,
  showPeriod = true,
  children,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  showPeriod?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="bg-canvas min-h-dvh">
      <header className="border-hairline bg-surface/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-350 flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-ink truncate text-base font-semibold tracking-tight">{title}</h1>
              {hint && <p className="text-ink-3 text-mini mt-0.5 truncate">{hint}</p>}
            </div>

            {actions}
            {showPeriod && <PeriodSelector />}
          </div>

          <nav aria-label="Superadmin sections" className="-mb-px flex gap-1 overflow-x-auto">
            {adminSections().map((section) => (
              <NavLink
                key={section.section}
                to={section.path}
                end={section.path === "/admin"}
                className={({ isActive }) =>
                  cn(
                    "text-ink-3 hover:text-ink hover:bg-wash shrink-0 rounded-control px-2.5 py-1.5 text-meta transition-colors",
                    isActive && "bg-brand-soft text-brand hover:bg-brand/20 hover:text-brand",
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

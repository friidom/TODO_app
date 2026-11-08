import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useIsFetching } from "@tanstack/react-query";

import { SidebarTrigger } from "@/components/ui/SideBarUI/sidebar";
import { useAdminLive } from "@/hooks/useAdminActivityRealtime";
import type { Crumb } from "@/services/admin/drilldown";
import { sectionForPath } from "@/services/admin/registry";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { cn } from "@/utils/cn";
import PeriodSelector from "./PeriodSelector";

// One admin page: the top bar with its trail, the header, and the body. The
// sidebar, the realtime socket and the Suspense around this live in
// AdminLayout, so they survive moving between pages.
export default function AdminPage({
  title,
  description,
  leading,
  trail,
  toolbar,
  children,
}: {
  title: string;
  // Replaces the section's icon tile, e.g. with a person's avatar.
  leading?: ReactNode;
  description?: ReactNode;
  // Below "Administration"; defaults to the section itself.
  trail?: Crumb[];
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const section = sectionForPath(pathname);
  const Icon = section.icon;

  return (
    <>
      <TopBar trail={trail ?? [{ label: section.label }]} />

      <div className="mx-auto flex w-full max-w-350 flex-col gap-5 px-4 pt-6 pb-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {leading ?? (
              <span className="bg-brand-soft text-brand rounded-control grid size-8 shrink-0 place-items-center">
                <Icon className="size-4" aria-hidden />
              </span>
            )}

            <h1 className="text-ink min-w-0 truncate text-xl font-semibold tracking-tight">
              {title}
            </h1>
          </div>

          {description && (
            <p className="text-ink-3 text-meta text-pretty">{description}</p>
          )}

          {(section.periodScoped || toolbar) && (
            <div className="flex flex-wrap items-center gap-2">
              {section.periodScoped && <PeriodSelector />}
              {toolbar}
            </div>
          )}
        </div>

        {children}
      </div>
    </>
  );
}

function TopBar({ trail }: { trail: Crumb[] }) {
  const { t } = useTranslation();
  const crumbs: Crumb[] = [{ label: t("admin.title"), to: "/admin" }, ...trail];

  return (
    <header className="border-hairline bg-canvas/85 sticky top-0 z-20 flex h-12 shrink-0 items-center gap-1.5 border-b px-2.5 backdrop-blur sm:px-4">
      <SidebarTrigger className="text-ink-3 hover:text-ink" />
      <span className="bg-hairline mr-1 h-4 w-px shrink-0" aria-hidden />

      <nav aria-label={t("common.breadcrumb")} className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;

            return (
              <li
                key={`${crumb.label}-${index}`}
                className={cn(
                  "flex min-w-0 items-center gap-1",
                  // The middle of a long trail gives way first on a phone.
                  !last && index > 0 && "max-sm:hidden",
                )}
              >
                {index > 0 && (
                  <ChevronRightIcon
                    className="text-ink-3/60 size-3.5 shrink-0"
                    aria-hidden
                  />
                )}

                {last || crumb.to === undefined ? (
                  <span
                    className={cn(
                      "text-meta max-w-56 truncate",
                      last ? "text-ink font-medium" : "text-ink-3",
                    )}
                    aria-current={last ? "page" : undefined}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    to={crumb.to}
                    className="text-ink-3 hover:text-ink text-meta max-w-40 truncate rounded-sm transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <LiveStatus />
    </header>
  );
}

// The page's own "refreshed" line: whether the realtime feed is joined, and
// whether anything on screen is still being fetched.
function LiveStatus() {
  const { t } = useTranslation();
  const live = useAdminLive();
  const fetching = useIsFetching({ queryKey: queryKeys.admin() }) > 0;

  return (
    <span
      role="status"
      className="text-ink-3 text-mini flex shrink-0 items-center gap-1.5 pl-2"
    >
      {fetching ? (
        <Loader2Icon className="size-3 animate-spin motion-reduce:animate-none" />
      ) : (
        <span
          className={cn(
            "size-1.5 rounded-full",
            live ? "bg-status-green" : "bg-ink-3/40",
          )}
          aria-hidden
        />
      )}

      <span className="max-sm:sr-only">
        {fetching
          ? t("admin.updating")
          : live
            ? t("admin.live")
            : t("admin.connecting")}
      </span>
    </span>
  );
}

// What the layout shows while a page's code arrives: the same frame, so the
// sidebar and the bar do not blink.
export function AdminPageFallback() {
  return (
    <>
      <header className="border-hairline flex h-12 shrink-0 items-center gap-2 border-b px-2.5 sm:px-4">
        <SidebarTrigger className="text-ink-3" />
        <span className="skeleton h-3 w-40 rounded" />
      </header>

      <div className="mx-auto flex w-full max-w-350 flex-col gap-5 px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="skeleton rounded-control size-8" />
          <span className="skeleton h-5 w-48 rounded" />
        </div>
        <span className="skeleton h-3 w-72 rounded" />
        <div className="grid gap-4 lg:grid-cols-2">
          <span className="skeleton rounded-card h-56" />
          <span className="skeleton rounded-card h-56" />
        </div>
      </div>
    </>
  );
}

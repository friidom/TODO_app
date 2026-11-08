import { useTranslation } from "react-i18next";
import { Suspense, useEffect, useMemo } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { ArrowLeftIcon, CircleUserIcon, ShieldCheckIcon } from "lucide-react";

import { preloadAdminPages } from "@/components/routes/lazyPages";
import { SummaryCardSize } from "@/components/summary/summaryCardSize";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/SideBarUI/sidebar";
import { useSidebar } from "@/components/ui/SideBarUI/use-sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AdminFeedContext,
  useAdminActivityRealtime,
} from "@/hooks/useAdminActivityRealtime";
import {
  ADMIN_GROUPS,
  adminGroupLabel,
  adminSections,
  sectionForPath,
} from "@/services/admin/registry";
import { useAuth } from "@/services/auth/useAuth";
import { useProfile } from "@/services/profile/useProfile";
import { AdminPageFallback } from "./AdminPage";

export default function AdminLayout() {
  const { t } = useTranslation();
  const { setTarget, live } = useAdminActivityRealtime();
  const feed = useMemo(() => ({ setTarget, live }), [setTarget, live]);

  // After the first page has had its turn at the network.
  useEffect(() => {
    const timer = setTimeout(preloadAdminPages, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <AdminFeedContext value={feed}>
      <SummaryCardSize value="roomy">
        <SidebarProvider>
          <TooltipProvider delay={400}>
            <a
              href="#admin-main"
              className="bg-elevated text-ink rounded-control shadow-e2 text-meta focus-visible:ring-brand sr-only z-50 px-3 py-2 outline-none focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-2"
            >
              {t("admin.skipToContent")}
            </a>

            <div className="bg-canvas flex h-svh w-full overflow-hidden">
              <AdminSidebar />

              <SidebarInset
                id="admin-main"
                tabIndex={-1}
                className="bg-canvas flex min-w-0 flex-1 flex-col overflow-y-auto outline-none"
              >
                <Suspense fallback={<AdminPageFallback />}>
                  <Outlet />
                </Suspense>
              </SidebarInset>
            </div>
          </TooltipProvider>
        </SidebarProvider>
      </SummaryCardSize>
    </AdminFeedContext>
  );
}

function AdminSidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { setOpenMobile } = useSidebar();

  const active = sectionForPath(pathname).section;
  const sections = adminSections();

  // The phone's sheet covers the page it just opened.
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" className="border-hairline border-r">
      <SidebarHeader className="px-3 py-3 group-data-[collapsible=icon]:px-2">
        <Link
          to="/admin"
          className="focus-visible:ring-brand rounded-control flex min-w-0 items-center gap-2.5 outline-none focus-visible:ring-2"
        >
          <span className="bg-brand text-brand-fg rounded-control shadow-e1 grid size-7 shrink-0 place-items-center">
            <ShieldCheckIcon className="size-4" />
          </span>

          <span className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-ink font-wordmark block truncate text-sm font-semibold tracking-tight">
              Veylo
            </span>
            <span className="text-ink-3 text-mini block truncate">
              {t("admin.title")}
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={t("admin.sectionsLabel")}>
          {ADMIN_GROUPS.map((group) => (
            <SidebarGroup key={group ?? "objects"}>
              {group && (
                <SidebarGroupLabel>{adminGroupLabel(group)}</SidebarGroupLabel>
              )}

              <SidebarMenu>
                {sections
                  .filter((definition) => definition.group === group)
                  .map((definition) => (
                    <SidebarMenuItem key={definition.section}>
                      <SidebarMenuButton
                        render={
                          <NavLink
                            to={definition.path}
                            end={definition.path === "/admin"}
                          />
                        }
                        isActive={definition.section === active}
                        tooltip={definition.label}
                      >
                        <definition.icon />
                        <span>{definition.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="border-hairline gap-1 border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/" />}
              tooltip={t("admin.backToBoards")}
            >
              <ArrowLeftIcon />
              <span>{t("admin.backToBoards")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="flex min-w-0 items-center gap-2.5 p-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0.5">
          <Avatar className="size-7 shrink-0">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-wash-strong text-ink-2">
              <CircleUserIcon className="size-4" />
            </AvatarFallback>
          </Avatar>

          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="text-ink text-meta block truncate font-medium">
              {profile?.username || user?.email}
            </span>
            <span className="text-ink-3 text-mini block truncate">
              {t("sidebar.superadmin")}
            </span>
          </span>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

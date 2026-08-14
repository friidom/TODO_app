import type { ReactNode } from "react";

import { AppSidebar } from "../sideBar/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/SideBarUI/sidebar";

/**
 * The application shell: a full-height sidebar and the workspace beside it.
 *
 * **Two things left in M17 and both were paying rent for nothing.**
 *
 * The *global header* held a permanently `disabled` search box and a
 * permanently `disabled` Create button — both duplicating controls that work in
 * the board's own toolbar — above a breadcrumb the app did not have. It cost a
 * 56px band on every screen to render two dead controls, so it is gone and its
 * live occupants (theme, language, the profile link) moved to the sidebar
 * footer, where account controls belong.
 *
 * The *`rail` prop* is gone with it. `ContextRail` was 288px of permanent width
 * holding one live panel (Members) and two placeholders (Activity, Quick
 * Filters). Members is now a drawer opened from the board's member stack,
 * Activity belongs to M18, and Quick Filters was a placeholder for saved
 * filters, which are still M12's. What replaces the prop is `ViewShell`'s
 * `drawer` slot: present only when a `?task=` or `?panel=` says so.
 *
 * `min-h-0` / `min-w-0` on the scrolling ancestors is load-bearing, not
 * decoration: a flex child defaults to `min-height: auto`, which refuses to
 * shrink below its content and would push the board's horizontal scroll onto
 * the page instead of keeping it inside the board.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="bg-canvas flex h-svh w-full overflow-hidden">
        <AppSidebar />

        <SidebarInset className="bg-canvas flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

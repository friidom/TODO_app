import type { ReactNode } from "react";

import Header from "./header/Header";
import { AppSidebar } from "../sideBar/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/SideBarUI/sidebar";

interface LayoutProps {
  children: ReactNode;
  /**
   * The contextual right rail. Optional because it is board-specific — the
   * profile page has no rail, and forcing an empty one there would be chrome
   * for its own sake.
   */
  rail?: ReactNode;
}

/**
 * The application shell: a full-height sidebar, then a column holding the
 * global header above the workspace, with the workspace split into content and
 * an optional rail.
 *
 * **Two things changed from the previous shell and both were bugs.** The header
 * used to sit above the sidebar rather than beside it, so the sidebar could not
 * be full height. And the main region carried
 * `style={{ maxWidth: calc(100vw - 256px) }}`, hard-coding the sidebar's width
 * in a second place and reading `useSidebar()` purely to compute it — the flex
 * layout below derives the same result from the sidebar's actual width, so
 * collapsing it no longer depends on a number staying in sync.
 *
 * `min-h-0` / `min-w-0` on the scrolling ancestors is load-bearing, not
 * decoration: a flex child defaults to `min-height: auto`, which refuses to
 * shrink below its content and would push the board's horizontal scroll onto
 * the page instead of keeping it inside the board.
 */
export default function Layout({ children, rail }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="bg-canvas flex h-svh w-full overflow-hidden">
        <AppSidebar />

        <SidebarInset className="bg-canvas flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />

          <div className="flex min-h-0 flex-1">
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </main>

            {rail}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

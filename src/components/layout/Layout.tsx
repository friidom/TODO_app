import type { ReactNode } from "react";

import { AppSidebar } from "../sideBar/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/SideBarUI/sidebar";

// min-h-0/min-w-0 on the scrolling ancestors matters — a flex child defaults to min-height:auto and won't shrink below its content
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

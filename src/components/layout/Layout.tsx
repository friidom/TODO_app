import type { ReactNode } from "react";
import Header from "./header/Header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/SideBarUI/sidebar";
import { AppSidebar } from "../sideBar/app-sidebar";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-col">
        {/* HEADER */}
        <Header />

        {/* SIDEBAR + CONTENT */}
        <div className="flex min-h-0 flex-1">
          <AppSidebar />

          <SidebarInset>
            <main className="min-w-0 flex-1 bg-app">
              <div className="mx-auto max-w-[1600px] px-6 py-6">
                {children}
              </div>
            </main>
          </SidebarInset>
        </div>
      </div>
      
    </SidebarProvider>
  );
}
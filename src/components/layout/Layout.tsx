import type { ReactNode } from "react";
import Header from "./header/Header";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/SideBarUI/sidebar";
import { AppSidebar } from "../sideBar/app-sidebar";

interface LayoutProps {
  children: ReactNode;
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();

  return (
    <>
      <Header />

      <div className="flex min-h-0 flex-1">
        <AppSidebar />

        <SidebarInset>
          <main className="bg-app min-w-0 flex-1">
            <div
              className="mx-auto px-6 py-6"
              style={{
                maxWidth: `calc(100vw - ${open ? "256px" : "0px"})`,
              }}
            >
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </>
  );
}

export default function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-col">
        <LayoutContent>{children}</LayoutContent>
      </div>
    </SidebarProvider>
  );
}

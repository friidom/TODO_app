import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { ClockIcon } from "lucide-react";

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { useSidebarFlyout } from "@/hooks/useSidebarFlyout";
import { cn } from "@/utils/cn";
import SidebarFlyout, { PanelLoading } from "./SidebarFlyout";

// Out of the entry chunk: the sidebar is on every page, the panel only when opened.
const RecentPanel = lazy(() => import("./RecentPanel"));

export default function RecentNav() {
  const { t } = useTranslation();
  const flyout = useSidebarFlyout();

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={flyout.show}
          aria-haspopup="dialog"
          aria-expanded={flyout.phase === "open"}
          tooltip={t("recent.title")}
          className={cn(flyout.visible && "bg-wash-strong text-ink")}
        >
          <ClockIcon />
          <span>{t("recent.title")}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarFlyout
        phase={flyout.phase}
        anchor={flyout.anchor}
        panelRef={flyout.panelRef}
        onHide={flyout.hide}
        label={t("recent.title")}
      >
        <Suspense fallback={<PanelLoading />}>
          <RecentPanel onClose={flyout.hide} />
        </Suspense>
      </SidebarFlyout>
    </>
  );
}

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { BellIcon } from "lucide-react";

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/SideBarUI/sidebar";
import { useUnreadCount } from "@/services/notifications/useNotifications";
import { cn } from "@/utils/cn";
import NotificationsPanel from "./NotificationsPanel";

const CLOSE_MS = 120;
const GAP = 8;
const MARGIN = 16;

type Anchor = { left: number; top: number };

// Portalled to body: the sidebar is its own stacking context, so a fixed panel
// rendered inside it can never rise above the page beside it. The layer is
// above the task modal (z-50) and the attachment lightbox (z-60).
export default function NotificationsButton() {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const [anchor, setAnchor] = useState<Anchor>({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = useUnreadCount();

  const visible = phase !== "closed";

  function show(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    triggerRef.current = event.currentTarget;
    setAnchor({
      left: rect.right + GAP,
      top: Math.max(MARGIN, Math.min(rect.top, window.innerHeight - 240)),
    });
    setPhase("open");
  }

  function hide() {
    setPhase((current) => (current === "open" ? "closing" : current));
  }

  useEffect(() => {
    if (phase !== "closing") return;

    const id = setTimeout(() => {
      setPhase("closed");
      triggerRef.current?.focus();
    }, CLOSE_MS);

    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return;

    panelRef.current?.focus();

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) hide();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [phase]);

  const closing = phase === "closing";

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={show}
          aria-haspopup="dialog"
          aria-expanded={phase === "open"}
          className={cn(visible && "bg-wash-strong text-ink")}
        >
          <BellIcon />
          <span>Notifications</span>

          {unread > 0 && (
            <span className="bg-brand text-brand-fg text-micro ml-auto rounded px-1.5 leading-4 font-semibold tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>

      {visible &&
        createPortal(
          <>
            <div
              aria-hidden
              onMouseDown={hide}
              className={cn(
                "fixed inset-0 z-[70] bg-black/40 duration-150 md:bg-transparent",
                closing
                  ? "motion-safe:animate-out motion-safe:fade-out-0"
                  : "motion-safe:animate-in motion-safe:fade-in-0",
              )}
            />

            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Notifications"
              tabIndex={-1}
              style={
                {
                  "--np-left": `${anchor.left}px`,
                  "--np-top": `${anchor.top}px`,
                } as React.CSSProperties
              }
              className={cn(
                "border-hairline bg-surface rounded-surface shadow-e3 fixed z-[71] overflow-hidden border outline-none max-md:inset-x-4 max-md:top-16 md:top-(--np-top) md:left-(--np-left)",
                "duration-150",
                closing
                  ? "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:zoom-out-95"
                  : "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-left-2",
              )}
            >
              <NotificationsPanel onClose={hide} />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

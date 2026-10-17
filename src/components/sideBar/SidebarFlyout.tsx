import type { CSSProperties, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

import type { FlyoutAnchor, FlyoutPhase } from "@/hooks/useSidebarFlyout";
import { cn } from "@/utils/cn";

// Portalled to body: the sidebar is its own stacking context, so a fixed panel
// rendered inside it can never rise above the page beside it. The layer is
// above the task modal (z-50) and the attachment lightbox (z-60).
export default function SidebarFlyout({
  phase,
  anchor,
  panelRef,
  onHide,
  label,
  className,
  children,
}: {
  phase: FlyoutPhase;
  anchor: FlyoutAnchor;
  panelRef: RefObject<HTMLDivElement | null>;
  onHide: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  if (phase === "closed") return null;

  const closing = phase === "closing";

  return createPortal(
    <>
      <div
        aria-hidden
        onMouseDown={onHide}
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
        aria-label={label}
        tabIndex={-1}
        style={
          {
            "--np-left": `${anchor.left}px`,
            "--np-top": `${anchor.top}px`,
          } as CSSProperties
        }
        className={cn(
          "border-hairline bg-surface rounded-surface shadow-e3 fixed z-[71] overflow-hidden border outline-none max-md:inset-x-4 max-md:top-16 md:top-(--np-top) md:left-(--np-left)",
          "duration-150",
          closing
            ? "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:zoom-out-95"
            : "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-left-2",
          className,
        )}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

// Sized like the panels, so the frame does not jump when the chunk arrives.
export function PanelLoading() {
  return (
    <div className="flex h-48 w-[min(24rem,calc(100vw-2rem))] items-center justify-center">
      <Loader2 aria-hidden className="text-ink-3 size-5 motion-safe:animate-spin" />
    </div>
  );
}

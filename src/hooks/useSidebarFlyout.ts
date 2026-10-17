import { useEffect, useRef, useState, type MouseEvent } from "react";

const CLOSE_MS = 120;
const GAP = 8;
const MARGIN = 16;

export type FlyoutPhase = "closed" | "open" | "closing";

export interface FlyoutAnchor {
  left: number;
  top: number;
}

export function useSidebarFlyout() {
  const [phase, setPhase] = useState<FlyoutPhase>("closed");
  const [anchor, setAnchor] = useState<FlyoutAnchor>({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus();
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) hide();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [phase]);

  return { phase, anchor, panelRef, show, hide, visible: phase !== "closed" };
}

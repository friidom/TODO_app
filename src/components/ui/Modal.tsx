import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.getClientRects().length > 0,
  );
}

// A dialog opened from a menu item outlives the menu, so focus goes back to the
// button the menu is labelled by rather than to an item no longer in the page.
function returnTarget(element: Element | null): HTMLElement | null {
  const menu = element?.closest("[role=menu]");
  const trigger = menu
    ? document.getElementById(menu.getAttribute("aria-labelledby") ?? "")
    : element;

  return trigger instanceof HTMLElement ? trigger : null;
}

// Every caller unmounts its dialog outright, so the exit is played on an inert
// copy of the last frame: it never delays or blocks the next interaction.
function fadeOut(root: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ghost = root.cloneNode(true) as HTMLElement;

  ghost.inert = true;
  ghost.classList.add("motion-ghost");
  document.body.append(ghost);

  const fade = ghost.animate(
    { opacity: [1, 0] },
    { duration: 140, easing: "ease-in" },
  );

  fade.onfinish = fade.oncancel = () => ghost.remove();
}

// Portalled into document.body — the sidebar is `fixed z-10` and its own stacking context, so a dialog rendered inside it
// gets trapped under z-10 sticky headers elsewhere in the page even with z-50 on itself. Moving to body makes z-50 actually win.
export default function Modal({
  title,
  onClose,
  children,
  width = "w-[420px]",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // read while rendering, before an autoFocus field inside has taken focus
  const [opener] = useState(() => returnTarget(document.activeElement));

  useEffect(() => {
    function handleEscape(e: globalThis.KeyboardEvent) {
      // a nested popover marks the event first so it can close itself without closing this dialog
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;

    if (panel && !panel.contains(document.activeElement)) {
      (focusablesIn(panel)[0] ?? panel).focus();
    }
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;

    return () => {
      if (root) fadeOut(root);

      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    const panel = event.currentTarget;

    // a portalled popover inside the dialog handles its own Tab order
    if (event.key !== "Tab" || !panel.contains(document.activeElement)) return;

    const items = focusablesIn(panel);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const edge = event.shiftKey ? at <= 0 : at === items.length - 1;

    if (!edge) return;

    event.preventDefault();
    (event.shiftKey ? items.at(-1) : items[0])?.focus();
  }

  return createPortal(
    <div
      ref={rootRef}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="motion-safe:animate-in motion-safe:fade-in-0 fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 duration-150"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={`border-hairline bg-surface rounded-surface max-h-full ${width} shadow-e3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-98 motion-safe:slide-in-from-bottom-1 ease-emphasized max-w-full overflow-y-auto border p-5 duration-200 outline-none`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      // a nested popover marks the event first so it can close itself without closing this dialog
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`border-hairline bg-surface rounded-surface max-h-full ${width} max-w-full overflow-y-auto border p-5 shadow-e3`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

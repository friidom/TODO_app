import { useEffect, type ReactNode } from "react";

/**
 * The overlay every M15 dialog sits in.
 *
 * Extracted because four new dialogs would otherwise repeat the same overlay,
 * the same click-outside test and the same Escape listener four times. The
 * column modals (`CreateColumnModal`, `DeleteColumnModal`, `ColumnLimitModal`)
 * and `InvitePeopleModal` each hand-roll it and are **deliberately left alone** —
 * migrating them is a diff across four working components for no behaviour, and
 * it is not this milestone's work.
 *
 * `onMouseDown` rather than `onClick` for the backdrop, matching the existing
 * modals: a click that *starts* inside the panel and finishes on the backdrop —
 * a text selection dragged past the edge — is not a dismissal.
 */
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
      // Deferred to whatever is on top: a select or a popover inside the dialog
      // handles Escape first and marks it, exactly as CreateColumnModal does.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
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
        className={`bg-card max-h-full ${width} max-w-full overflow-y-auto rounded-2xl p-6 shadow-2xl`}
      >
        {children}
      </div>
    </div>
  );
}

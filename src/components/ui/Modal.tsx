import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
 * **It renders through a portal into `document.body`, and that is load-bearing
 * rather than tidiness.** `z-50` only outranks `z-10` inside the *same stacking
 * context*, and half of this component's callers render from inside the sidebar
 * (`BoardsSection`: create/rename/delete a board, create/rename/delete a
 * space). The sidebar's container is `fixed … z-10`, which makes it a stacking
 * context of its own, so a dialog opened from it was trapped at the sidebar's
 * z-10 — and the sidebar comes *before* the workspace in DOM order, so every
 * `z-10` sticky header in the view beside it painted on top: the day headers in
 * the For You feed ("Yesterday", "Last week"), the Activity drawer's, and the
 * List view's group dividers. A portal moves the dialog out from under that
 * `z-10` into the body, where its `z-50` means what it says, and being the last
 * child of `<body>` also puts it above the `z-50` drawer that may be open
 * behind it.
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
        // `bg-surface` + `rounded-surface` + a hairline, matching every other
        // raised surface in the product (M22). It was `bg-card`/`rounded-2xl`
        // /`shadow-2xl` — pre-token classes and a heavier shadow than anything
        // else here, so a dialog read as belonging to a different application
        // than the board it opened over.
        className={`border-hairline bg-surface rounded-surface max-h-full ${width} max-w-full overflow-y-auto border p-5 shadow-e3`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

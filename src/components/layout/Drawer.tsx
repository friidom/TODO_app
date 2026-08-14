import { useEffect, type ReactNode } from "react";
import { XIcon } from "lucide-react";

/**
 * The frame every panel beside a view sits in (M17).
 *
 * **Pushes at `xl`, overlays below it.** On a wide screen the board keeps its
 * context beside the panel, which is the behaviour the old right rail had and
 * the reason UX principle 1 ("board context is never lost") holds. Below that
 * width there is no room to push without squeezing the board into a gutter, so
 * it covers with a scrim instead — which is also what makes a panel usable on a
 * phone, where the rail simply vanished.
 *
 * It renders in normal flow rather than a portal, so at `xl` it participates in
 * the shell's flex row; the overlay case is a `fixed` variant of the same
 * element rather than a second component.
 *
 * **Split from `Drawer` because the task panel brings its own header.** Both
 * panels need identical positioning, scrim and Escape behaviour, and only one
 * of them needs a title bar drawn for it — so the frame is the shared part and
 * the header is the difference. Without the split, `TaskDetailPanel` would
 * either grow a second header or keep its own positioning and drift from the
 * members drawer the first time either changed.
 *
 * Focus trapping is deliberately not attempted here. Escape closes, and the
 * full keyboard treatment — trap, restore, `aria-modal` semantics — belongs to
 * M9-02 alongside the board's own accessibility pass, which will do it once for
 * every overlay rather than once per component.
 */
export function DrawerFrame({
  label,
  onClose,
  dismissible = true,
  children,
}: {
  label: string;
  onClose: () => void;
  /**
   * Whether Escape and the scrim close it.
   *
   * **`false` for the task panel, and not as a preference.** That panel guards
   * its own close: with an unsaved title or description it asks before
   * discarding, and the check lives with the drafts inside it. A frame-level
   * Escape would route around that guard and silently drop the edit — so the
   * panel opts out and its own header button, which asks, is the way out.
   * Nothing is lost by comparison with the rail it replaced, which had neither.
   */
  dismissible?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!dismissible) return;

    function handleEscape(e: KeyboardEvent) {
      // Deferred to whatever is on top: a popover inside the panel handles
      // Escape first and marks it, the rule `ui/Modal.tsx` already follows.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, dismissible]);

  return (
    <>
      {/* Scrim, and only where the panel covers something. At `xl` it sits
          beside the board and a scrim would dim a board still being read. */}
      <div
        onClick={dismissible ? onClose : undefined}
        aria-hidden
        className="fixed inset-0 z-40 bg-black/40 xl:hidden"
      />

      <aside
        aria-label={label}
        className="border-hairline bg-rail fixed inset-y-0 right-0 z-50 flex w-[min(24rem,100vw)] shrink-0 flex-col border-l xl:static xl:z-auto xl:w-[22rem]"
      >
        {children}
      </aside>
    </>
  );
}

/** A drawer with a title bar drawn for it — the common case. */
export default function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <DrawerFrame label={title} onClose={onClose}>
      <header className="border-hairline flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="text-ink truncate text-sm font-semibold">{title}</h2>

        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="text-ink-3 hover:bg-elevated hover:text-ink rounded-control ml-auto grid size-7 shrink-0 place-items-center transition-colors"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </DrawerFrame>
  );
}

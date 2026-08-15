import { useEffect, type ReactNode } from "react";
import { XIcon } from "lucide-react";

/**
 * A panel beside a view — the members roster, and whatever M18 adds next to it.
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
 * **`DrawerFrame` and its `dismissible` flag are gone.** The split existed for
 * one caller: the task detail, which drew its own header and opted out of
 * Escape so its unsaved-changes guard could not be routed around. The task
 * detail is a modal now (`TaskDetailModal`), so a headerless, undismissable
 * drawer is a shape nothing asks for — and a prop with no caller is a promise
 * the next reader would believe.
 *
 * Focus trapping is deliberately not attempted here. Escape closes, and the
 * full keyboard treatment — trap, restore, `aria-modal` semantics — belongs to
 * M9-02 alongside the board's own accessibility pass, which will do it once for
 * every overlay rather than once per component.
 */
export default function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      // Deferred to whatever is on top: a popover inside the panel handles
      // Escape first and marks it, the rule `ui/Modal.tsx` already follows.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <>
      {/* Scrim, and only where the panel covers something. At `xl` it sits
          beside the board and a scrim would dim a board still being read. */}
      <div
        onClick={onClose}
        aria-hidden
        className="fixed inset-0 z-40 bg-black/40 xl:hidden"
      />

      <aside
        aria-label={title}
        className="border-hairline bg-rail fixed inset-y-0 right-0 z-50 flex w-[min(24rem,100vw)] shrink-0 flex-col border-l xl:static xl:z-auto xl:w-[22rem]"
      >
        <header className="border-hairline flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <h2 className="text-ink truncate text-sm font-semibold">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="text-ink-3 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control ml-auto grid size-7 shrink-0 place-items-center transition-colors outline-none focus-visible:ring-2"
          >
            <XIcon className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}

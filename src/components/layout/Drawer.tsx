import { useEffect, type ReactNode } from "react";
import { XIcon } from "lucide-react";

// pushes the board at xl, overlays with a scrim below it — no room to push without squeezing the board into a gutter
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
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <>
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

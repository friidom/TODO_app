import { PlusIcon, SearchIcon } from "lucide-react";

import HeaderActions from "./HeaderActions";
import { SidebarTrigger } from "@/components/ui/SideBarUI/sidebar";

/**
 * The global top bar: identity on the left, search in the middle, actions right.
 *
 * **Search and Create are visual placeholders.** Neither has a backing feature
 * yet, so both are inert and marked `disabled` rather than wired to something
 * that would fail. The quick-add form that used to sit in this header moved to
 * `BoardHeader` — it reads `useColumns()`, which is board-scoped, so a global
 * header was the wrong place for it and it rendered on `/profile` too.
 */
export default function Header() {
  return (
    <header className="border-hairline bg-rail/80 sticky top-0 z-40 flex h-14 w-full shrink-0 items-center gap-3 border-b px-3 backdrop-blur-sm md:px-4">
      <div className="flex shrink-0 items-center gap-1">
        <SidebarTrigger className="text-ink-2 hover:text-ink" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 justify-center">
        <div className="relative w-full">
          <SearchIcon className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            type="search"
            disabled
            placeholder="Search tasks, boards, or people…"
            aria-label="Search — not built yet"
            className="border-hairline bg-surface text-ink placeholder:text-ink-3 focus-visible:ring-brand/40 h-9 w-full rounded-control border pr-3 pl-9 text-sm transition-colors outline-none focus-visible:ring-2 disabled:cursor-default"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled
          title="Create — not built yet"
          className="bg-brand text-brand-fg hover:bg-brand/90 hidden h-9 items-center gap-1.5 rounded-control px-3 text-sm font-medium shadow-sm transition-colors disabled:cursor-default disabled:opacity-70 sm:inline-flex"
        >
          <PlusIcon className="size-4" />
          Create
        </button>

        <HeaderActions />
      </div>
    </header>
  );
}

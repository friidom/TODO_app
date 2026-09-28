import { useEffect, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import { ICON_BUTTON } from "@/components/ui/controlChrome";
import type { BoardView } from "@/hooks/useBoardView";
import { cn } from "@/utils/cn";

/** Long enough to swallow a burst of typing, short enough to feel immediate. */
const WRITE_DELAY = 180;

// q is a URL param, so writing it on every keystroke means a router nav + full re-filter per character.
// This echoes locally and writes the URL on a delay instead — q still ends up holding exactly what was typed.
export default function BoardSearch({ view }: { view: BoardView }) {
  const { query, setQuery } = view;

  const [draft, setDraft] = useState(query);
  const [seen, setSeen] = useState(query);

  // Adopt a query changed from outside the field (Back button, "Clear search") — adjusted during render, not an effect, to avoid the double-render.
  if (seen !== query) {
    setSeen(query);
    setDraft(query);
  }

  useEffect(() => {
    if (draft === query) return;

    const id = setTimeout(() => setQuery(draft), WRITE_DELAY);

    return () => clearTimeout(id);
  }, [draft, query, setQuery]);

  const active = draft.trim().length > 0;

  function clear() {
    // both, immediately — a clear shouldn't wait out the debounce
    setDraft("");
    setQuery("");
  }

  return (
    <div
      className={cn(
        "border-hairline bg-surface text-ink-3 rounded-control flex h-9 max-w-64 min-w-24 flex-1 items-center gap-2 border px-2.5 transition-colors duration-150 @max-md:min-w-20 @6xl:max-w-72",
        "focus-within:border-brand/50 focus-within:ring-brand/30 focus-within:ring-2",
        active && "border-brand/40 text-brand pr-1",
      )}
    >
      <SearchIcon className="size-4 shrink-0" />

      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && draft) {
            e.stopPropagation();
            clear();
          }
        }}
        aria-label="Search work items"
        placeholder="Search board"
        className="text-ink placeholder:text-ink-3 text-meta min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden"
      />

      {active && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className={ICON_BUTTON.xs}
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}

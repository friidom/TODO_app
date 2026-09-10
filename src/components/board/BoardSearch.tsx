import { useEffect, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import type { BoardView } from "@/hooks/useBoardView";
import { cn } from "@/utils/cn";
import { HEADER_CONTROL_ACTIVE, HEADER_CONTROL_QUIET } from "./headerControl";

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
        HEADER_CONTROL_QUIET,
        "min-w-0 flex-1 md:w-56 md:flex-none lg:w-72 2xl:w-96",
        active && HEADER_CONTROL_ACTIVE,
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
        placeholder="Search or KAN-12"
        className="placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
      />

      {active && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="hover:text-ink shrink-0"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

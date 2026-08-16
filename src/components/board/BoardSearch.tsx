import { useEffect, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import type { BoardView } from "@/hooks/useBoardView";
import { cn } from "@/utils/cn";
import { HEADER_CONTROL_ACTIVE, HEADER_CONTROL_QUIET } from "./headerControl";

/** Long enough to swallow a burst of typing, short enough to feel immediate. */
const WRITE_DELAY = 180;

/**
 * Find a work item by name, or by its key.
 *
 * **Every view gets this for free**, because the matching happens in
 * `useVisibleTodos` alongside the filter and the sort — the board and the list
 * are two renderings of one answer, and search is part of that answer rather
 * than a control one of them owns.
 *
 * **The field echoes locally and writes the URL on a delay.** `q` is a search
 * param, so every keystroke used to be a router navigation: a re-render of the
 * whole subtree plus a re-run of filter → search → sort → group over the entire
 * board, per character. That is the lag behind "search feels unreliable" — the
 * matching was fast, the URL write was not. The draft below decouples the two,
 * and `q` still ends up holding exactly what was typed, so a shared link and a
 * refresh are unchanged.
 */
export default function BoardSearch({ view }: { view: BoardView }) {
  const { query, setQuery } = view;

  const [draft, setDraft] = useState(query);
  const [seen, setSeen] = useState(query);

  // Adopt a query that changed from OUTSIDE the field — the Back button, or
  // `ViewNotice`'s "Clear search" — without which the input would keep showing
  // text the board is no longer narrowed by.
  //
  // Adjusted during render rather than in an effect. React documents this
  // shape for exactly this case, and the effect version is the derived-state
  // antipattern `react-hooks/set-state-in-effect` exists to catch: it renders
  // once with the stale value, then again with the fresh one. `seen` is what
  // makes the comparison about *the query changing* rather than about the two
  // differing, which they do for the whole debounce window.
  if (seen !== query) {
    setSeen(query);
    setDraft(query);
  }

  // The write. Skipped when the two already agree, which is what keeps the
  // adjustment above and this effect from handing the same value back and
  // forth.
  useEffect(() => {
    if (draft === query) return;

    const id = setTimeout(() => setQuery(draft), WRITE_DELAY);

    return () => clearTimeout(id);
  }, [draft, query, setQuery]);

  const active = draft.trim().length > 0;

  function clear() {
    // Both, and immediately: a clear is a decision rather than a keystroke, so
    // it should not wait out the debounce.
    setDraft("");
    setQuery("");
  }

  return (
    <div
      className={cn(
        HEADER_CONTROL_QUIET,
        // The widest control in the row, and it earns it: search is the one
        // thing here used on every visit, and a field that shows six characters
        // of a query makes you re-read what you typed. It keeps growing past
        // `lg` because the toolbar's other four controls are fixed-width, so
        // every pixel a wide screen adds would otherwise become empty gap.
        "w-44 md:w-56 lg:w-72 2xl:w-96",
        // Once it is holding a query it is a decision like the others, so it
        // takes the same active treatment they do.
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
        // The wrapper carries the ring, so the input itself has none — two
        // focus rings around one control read as a rendering bug.
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

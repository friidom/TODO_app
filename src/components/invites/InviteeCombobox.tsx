import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { useInviteeSearch } from "@/services/invites/useInviteeSearch";
import type { Invitee } from "@/services/invites/invitesApi";
import { cn } from "@/utils/cn";

/**
 * The invite field's autocomplete over registered users (M4-08 stage 1).
 *
 * **A combobox rather than a select**, because the list is a search result and
 * not a set of options: it is server-filtered, it is capped at eight rows, and
 * it is empty until two characters have been typed. A `<select>` would have to
 * hold every account in the product to offer the same choice.
 *
 * The selected person is rendered as a chip *in place of* the input rather than
 * as text inside it. An address sitting in an editable field looks like
 * something you are still typing; a chip with a remove button says the choice
 * has been made and how to undo it.
 *
 * Stage 1 offers registered users only, so "no users found" is a terminal
 * answer here. Stage 2 is where that state grows an "invite anyway" action for
 * an address with no account behind it, which is why the empty state is its own
 * branch rather than a bare message.
 */
export default function InviteeCombobox({
  boardId,
  value,
  onChange,
  disabled = false,
}: {
  boardId: string | undefined;
  value: Invitee | null;
  onChange: (invitee: Invitee | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  /** Which row the arrow keys are on. -1 is "none", not "the first". */
  const [active, setActive] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const {
    data: results = [],
    error,
    searching,
    tooShort,
  } = useInviteeSearch(boardId, query);

  // A shorter result set can strand the highlight past the end. Clamped here
  // rather than reset from an effect: the effect would set state during render's
  // aftermath purely to compute something render already knows.
  const activeIndex = active < results.length ? active : -1;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);

    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function select(invitee: Invitee) {
    onChange(invitee);
    setQuery("");
    setOpen(false);
    setActive(-1);
  }

  function clear() {
    onChange(null);
    setQuery("");
    // Focus returns to the field, so removing the wrong person and picking
    // again is one motion rather than a click and a hunt for the caret.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Backspace on an empty field removes the chip — the behaviour every
    // token field has, and the reason the chip needs no click to undo.
    if (event.key === "Backspace" && query === "" && value) {
      event.preventDefault();
      clear();
      return;
    }

    if (!open || !results.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      // Only when a row is highlighted: otherwise Enter belongs to the form,
      // which is how someone who typed a full address and never touched the
      // arrows still submits.
      event.preventDefault();
      select(results[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      // Marked handled so the dialog's own Escape listener does not also fire
      // and close the whole modal out from under a dropdown.
      event.preventDefault();
      setOpen(false);
    }
  }

  if (value) {
    return (
      <div className="border-hairline mb-6 flex items-center gap-2.5 rounded-lg border px-3 py-2">
        <Avatar invitee={value} />

        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-sm font-medium">
            {displayName(value)}
          </span>
          {value.email && displayName(value) !== value.email && (
            <span className="text-ink-3 block truncate text-xs">
              {value.email}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          aria-label={`Remove ${displayName(value)}`}
          className="text-ink-2 hover:bg-ink/10 shrink-0 rounded p-1"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  const showEmpty =
    open &&
    !searching &&
    !error &&
    !tooShort &&
    query.trim().length >= 2 &&
    !results.length;

  return (
    <div ref={wrapRef} className="relative mb-6">
      <div className="border-hairline focus-within:border-brand focus-within:ring-brand flex items-center gap-2 rounded-lg border px-3 focus-within:ring-1">
        <Search size={15} className="text-ink-3 shrink-0" />

        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search people by name or email"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          className="text-ink placeholder:text-ink-3 w-full bg-transparent py-2.5 text-sm outline-none"
        />

        {searching && (
          <Loader2 size={15} className="text-ink-3 shrink-0 animate-spin" />
        )}
      </div>

      {open && (searching || error || showEmpty || results.length > 0) && (
        <ul
          id={listId}
          role="listbox"
          className="border-hairline bg-elevated absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border py-1 shadow-xl"
        >
          {error ? (
            <li className="text-status-red px-3 py-2.5 text-sm">
              Could not search people. Try again.
            </li>
          ) : searching && !results.length ? (
            <li className="text-ink-3 px-3 py-2.5 text-sm">Searching…</li>
          ) : showEmpty ? (
            <li className="text-ink-3 px-3 py-2.5 text-sm">
              No users found. Only people with an account can be invited for now
              — share a link instead.
            </li>
          ) : (
            results.map((invitee, index) => (
              <li
                key={invitee.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  onClick={() => select(invitee)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                    index === activeIndex && "bg-ink/[0.06]",
                  )}
                >
                  <Avatar invitee={invitee} />

                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-sm">
                      {displayName(invitee)}
                    </span>
                    {invitee.email &&
                      displayName(invitee) !== invitee.email && (
                        <span className="text-ink-3 block truncate text-xs">
                          {invitee.email}
                        </span>
                      )}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** `full_name`, else `username`, else the address — all three are nullable. */
function displayName(invitee: Invitee) {
  return invitee.full_name || invitee.username || invitee.email || "Unnamed";
}

function Avatar({ invitee }: { invitee: Invitee }) {
  const initial = displayName(invitee).charAt(0).toUpperCase();

  if (invitee.avatar_url) {
    return (
      <img
        src={invitee.avatar_url}
        alt=""
        className="size-7 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span className="bg-brand-soft text-brand flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
      {initial}
    </span>
  );
}

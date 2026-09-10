import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { useInviteeSearch } from "@/services/invites/useInviteeSearch";
import type { Invitee } from "@/services/invites/invitesApi";
import { cn } from "@/utils/cn";

// Registered users only for now, so "no users found" is terminal here — no "invite anyway" fallback yet.
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
  // -1 means "none", not "the first"
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

  // clamped here rather than an effect — a shorter result set can strand the highlight past the end
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
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
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
      event.preventDefault();
      select(results[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      // stop it bubbling to the dialog's Escape handler, or it closes the whole modal
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
      <div className="border-hairline focus-within:border-brand/50 focus-within:ring-brand/30 rounded-control flex items-center gap-2 border px-3 transition-colors focus-within:ring-2">
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
          className="border-hairline bg-elevated absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border py-1 shadow-e2"
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

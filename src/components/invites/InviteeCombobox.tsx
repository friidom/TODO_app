import i18n from "@/components/i18n";
import { useTranslation } from "react-i18next";
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { roleLabel } from "@/components/members/roleStyles";
import { expiresLabel } from "@/services/invites/inviteLink";
import { useInviteeSearch } from "@/services/invites/useInviteeSearch";
import type { Invitee, InviteScope } from "@/services/invites/invitesApi";
import { cn } from "@/utils/cn";
import { inviteeName } from "./inviteOptions";

// Whether a result can be picked, and what to say about it either way. For a
// space, being on some of the chosen boards is worth saying but blocks nothing.
function availability(
  invitee: Invitee,
  chosen: readonly string[] | undefined,
): { blocked: boolean; note: string | null } {
  if (invitee.member_role) {
    return {
      blocked: true,
      note: i18n.t("invites.alreadyOnBoard", {
        role: roleLabel(invitee.member_role),
      }),
    };
  }

  if (invitee.invited_until) {
    return {
      blocked: true,
      note: i18n.t("invites.alreadyInvited", {
        when: expiresLabel(invitee.invited_until).toLowerCase(),
      }),
    };
  }

  const on = chosen?.filter((id) => invitee.member_board_ids?.includes(id));

  if (chosen && on && on.length > 0) {
    return on.length === chosen.length
      ? { blocked: true, note: i18n.t("invites.onEveryBoard") }
      : {
          blocked: false,
          note: i18n.t("invites.onSomeBoards", {
            count: on.length,
            total: chosen.length,
          }),
        };
  }

  return { blocked: false, note: null };
}

// Registered users only for now, so "no users found" is terminal here — no "invite anyway" fallback yet.
export default function InviteeCombobox({
  id,
  describedBy,
  scope,
  chosen,
  value,
  onChange,
  disabled = false,
}: {
  id?: string;
  describedBy?: string;
  scope: InviteScope | null;
  // the boards a space invitation would grant, which decide who is already on all of them
  chosen?: readonly string[];
  value: Invitee | null;
  onChange: (invitee: Invitee | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // -1 means "none", not "the first"
  const [active, setActive] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const {
    data: found = [],
    error,
    searching,
    tooShort,
  } = useInviteeSearch(scope, query);

  // the previous answer is kept as placeholder data, which must not reappear once the query is cleared
  const results = query.trim().length >= 2 ? found : [];

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
    if (availability(invitee, chosen).blocked) return;

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
      <div className="border-hairline rounded-control flex h-10 items-center gap-2.5 border px-2">
        <Avatar invitee={value} />

        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-sm font-medium">
            {inviteeName(value)}
          </span>
          {value.email && inviteeName(value) !== value.email && (
            <span className="text-ink-3 block truncate text-xs">
              {value.email}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          aria-label={t("invites.removePerson", { name: inviteeName(value) })}
          className="text-ink-2 hover:bg-ink/10 focus-visible:ring-brand shrink-0 rounded p-1 outline-none focus-visible:ring-2"
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
    <div ref={wrapRef} className="relative">
      <div className="border-hairline focus-within:border-brand/50 focus-within:ring-brand/30 rounded-control flex h-10 items-center gap-2 border px-3 transition-colors focus-within:ring-2">
        <Search size={15} className="text-ink-3 shrink-0" />

        <input
          ref={inputRef}
          id={id}
          autoFocus
          aria-describedby={describedBy}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("invites.searchPeople")}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          className="text-ink placeholder:text-ink-3 h-full w-full bg-transparent text-sm outline-none"
        />

        {searching && (
          <Loader2 size={15} className="text-ink-3 shrink-0 animate-spin" />
        )}
      </div>

      {open && (searching || error || showEmpty || results.length > 0) && (
        <ul
          id={listId}
          role="listbox"
          className="border-hairline bg-elevated shadow-e2 absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border py-1"
        >
          {error ? (
            <li className="text-status-red px-3 py-2.5 text-sm">
              {t("invites.searchFailed")}
            </li>
          ) : searching && !results.length ? (
            <li className="text-ink-3 px-3 py-2.5 text-sm">
              {t("invites.searching")}
            </li>
          ) : showEmpty ? (
            <li className="text-ink-3 px-3 py-2.5 text-sm">
              {t("invites.noUsers")}
            </li>
          ) : (
            results.map((invitee, index) => {
              const { blocked, note } = availability(invitee, chosen);

              return (
                <li
                  key={invitee.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-disabled={blocked}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => select(invitee)}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                      index === activeIndex && "bg-ink/[0.06]",
                      blocked && "cursor-not-allowed",
                    )}
                  >
                    <span className={cn("contents", blocked && "opacity-60")}>
                      <Avatar invitee={invitee} />

                      <span className="min-w-0 flex-1">
                        <span className="text-ink block truncate text-sm">
                          {inviteeName(invitee)}
                        </span>
                        {invitee.email &&
                          inviteeName(invitee) !== invitee.email && (
                            <span className="text-ink-3 block truncate text-xs">
                              {invitee.email}
                            </span>
                          )}
                      </span>
                    </span>

                    {note && (
                      <span className="text-ink-3 text-mini shrink-0">
                        {note}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

function Avatar({ invitee }: { invitee: Invitee }) {
  const initial = inviteeName(invitee).charAt(0).toUpperCase();

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

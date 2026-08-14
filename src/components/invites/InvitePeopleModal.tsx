import { useEffect, useState } from "react";
import { CheckIcon, ChevronDown, CopyIcon, X } from "lucide-react";

import PendingInviteRow from "./PendingInviteRow";
import { copyInviteLink } from "./copyInviteLink";
import {
  DEFAULT_EXPIRY_DAYS,
  DEFAULT_INVITE_ROLE,
  EXPIRY_OPTIONS,
  INVITE_ROLE_OPTIONS,
} from "./inviteOptions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { inviteUrl } from "@/services/invites/inviteLink";
import { usePermissions } from "@/hooks/usePermissions";
import { useCreateInvite } from "@/services/invites/useCreateInvite";
import { usePendingInvites } from "@/services/invites/usePendingInvites";
import type { CreatedInvite, InviteRole } from "@/services/invites/invitesApi";
import { useBoardId } from "@/hooks/useBoardId";

/**
 * "Invite people" — generate a link, copy it, see and revoke the pending ones.
 *
 * The modal shell is `DeleteColumnModal`'s: a dimmed backdrop that closes on a
 * click outside, a centred card, Escape to close. Same object as the rest of
 * the app rather than a new dialog vocabulary.
 *
 * **What it does not do: send email.** The address field is present and
 * disabled, because v1 is link invites only (docs/IMPLEMENTATION_PLAN.md, M4)
 * — `board_invites.email` exists so email invites are additive later. An
 * enabled field that quietly did nothing would be worse than an obviously
 * disabled one.
 *
 * The role selector is UX, not enforcement. Every rule it expresses is
 * enforced again in `create_invite`: an admin cannot invite an admin, and
 * nobody can invite an owner. Disabling the option is how the UI explains a
 * refusal it already knows is coming.
 */
export default function InvitePeopleModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // The dialog lives in its own component so closing UNMOUNTS it. That resets
  // the role, the expiry and — the one that matters — the generated link, with
  // no effect syncing state to the `open` prop. Reopening should not offer the
  // link from last time as if it were fresh.
  if (!open) return null;

  return <InviteDialog onClose={onClose} />;
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const boardId = useBoardId();

  const { canManageMembers: canInvite, canManageAdmins: canInviteAdmins } =
    usePermissions(boardId);

  const [role, setRole] = useState<InviteRole>(DEFAULT_INVITE_ROLE);
  const [days, setDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  const createInvite = useCreateInvite();

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      // The dropdowns handle Escape first when one is open.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!boardId) return;

    createInvite.mutate(
      { boardId, role, expiresInDays: days },
      { onSuccess: setCreated },
    );
  }

  const roleOption =
    INVITE_ROLE_OPTIONS.find((option) => option.value === role) ??
    INVITE_ROLE_OPTIONS[0];

  const expiryOption =
    EXPIRY_OPTIONS.find((option) => option.value === days) ?? EXPIRY_OPTIONS[1];

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Invite people"
        className="bg-card max-h-full w-[560px] overflow-y-auto rounded-2xl p-7 shadow-2xl"
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 className="text-ink text-xl font-bold">Invite people</h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-2 hover:bg-ink/10 -mt-1 shrink-0 rounded p-1"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-ink-2 mb-6 text-sm">
          Create a link and share it. Whoever opens it joins this board with the
          role you choose.
        </p>

        {/* The email field is the Jira silhouette without the behaviour: v1
            sends nothing, and the placeholder says so rather than leaving
            someone to type an address and wonder where it went. */}
        <label className="text-ink mb-1.5 block text-sm font-medium">
          Names or emails
        </label>

        <input
          disabled
          placeholder="Email invitations are coming soon — share a link instead"
          className="border-hairline text-ink-3 mb-6 w-full cursor-not-allowed rounded-lg border bg-transparent px-3 py-2.5 text-sm"
        />

        <div className="mb-6 grid grid-cols-2 gap-3">
          <div>
            <label className="text-ink mb-1.5 block text-sm font-medium">
              Role
            </label>

            <DropdownMenu>
              <DropdownMenuTrigger className="border-hairline focus-visible:border-brand focus-visible:ring-brand data-[popup-open]:border-brand flex w-full items-center gap-2 rounded-lg border bg-transparent px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-1">
                <span className="truncate">{roleOption.label}</span>
                <ChevronDown
                  size={16}
                  className="text-ink-2 ml-auto shrink-0"
                />
              </DropdownMenuTrigger>

              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={role}
                  onValueChange={(next) => setRole(next as InviteRole)}
                >
                  {INVITE_ROLE_OPTIONS.map((option) => {
                    // An admin inviting an admin is refused by create_invite's
                    // strictly-below-own-rank rule. Say so here rather than
                    // letting the request fail with a permission error.
                    const blocked =
                      option.value === "admin" && !canInviteAdmins;

                    return (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        disabled={blocked}
                      >
                        <span className="flex flex-col">
                          <span className="font-medium">{option.label}</span>
                          <span className="text-ink-3 text-xs">
                            {blocked
                              ? "Only the board owner can invite admins."
                              : option.description}
                          </span>
                        </span>
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <label className="text-ink mb-1.5 block text-sm font-medium">
              Link expires
            </label>

            <DropdownMenu>
              <DropdownMenuTrigger className="border-hairline focus-visible:border-brand focus-visible:ring-brand data-[popup-open]:border-brand flex w-full items-center gap-2 rounded-lg border bg-transparent px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-1">
                <span className="truncate">{expiryOption.label}</span>
                <ChevronDown
                  size={16}
                  className="text-ink-2 ml-auto shrink-0"
                />
              </DropdownMenuTrigger>

              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={String(days)}
                  onValueChange={(next) => setDays(Number(next))}
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={String(option.value)}
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {created && <CreatedLink invite={created} />}

        {createInvite.error && (
          <p className="bg-status-red/15 text-status-red mb-4 rounded-lg px-4 py-3 text-sm">
            {createInvite.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={!canInvite || createInvite.isPending}
          className="bg-brand text-brand-fg hover:bg-brand/90 w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {createInvite.isPending
            ? "Creating link..."
            : created
              ? "Create another link"
              : "Create invite link"}
        </button>

        <PendingInvites boardId={boardId} canInvite={canInvite} />

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-ink hover:bg-ink/10 rounded-lg px-4 py-2 text-sm"
          >
            Done
          </button>
        </div>
      </form>
    </div>
  );
}

/** The link that was just minted, ready to copy. */
function CreatedLink({ invite }: { invite: CreatedInvite }) {
  return (
    <div className="border-brand/30 bg-brand-soft/40 mb-4 rounded-lg border p-3">
      <p className="text-ink mb-2 flex items-center gap-1.5 text-xs font-medium">
        <CheckIcon className="text-status-green size-3.5" />
        Link created. It works once, for one person.
      </p>

      <div className="flex items-center gap-2">
        {/* Read-only rather than disabled: the text must stay selectable so
            there is a manual path when the clipboard API is unavailable. */}
        <input
          readOnly
          value={inviteUrl(invite.token, window.location.origin)}
          onFocus={(e) => e.currentTarget.select()}
          className="border-hairline bg-card text-ink-2 min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-xs"
        />

        <button
          type="button"
          onClick={() => void copyInviteLink(invite.token)}
          className="bg-brand text-brand-fg hover:bg-brand/90 flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
        >
          <CopyIcon className="size-3.5" />
          Copy link
        </button>
      </div>
    </div>
  );
}

/**
 * Every link on this board that can still be used.
 *
 * Accepted and expired invites are filtered out in the query (M4-07), so this
 * list is exactly the set of things "copy" and "revoke" make sense for.
 */
function PendingInvites({
  boardId,
  canInvite,
}: {
  boardId: string | undefined;
  canInvite: boolean;
}) {
  const {
    data: invites,
    isPending,
    error,
  } = usePendingInvites(boardId, canInvite);

  return (
    <section className="mt-7">
      <h3 className="text-ink mb-2 text-sm font-semibold">
        Pending invitations
      </h3>

      {isPending ? (
        <div className="space-y-2 py-1" aria-busy>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : error ? (
        <p className="border-status-red/30 text-status-red rounded-lg border border-dashed px-3 py-3 text-xs">
          Could not load pending invitations.
        </p>
      ) : invites.length === 0 ? (
        <p className="border-hairline text-ink-3 rounded-lg border border-dashed px-3 py-3 text-xs">
          No pending invitations. Links you create appear here until they are
          used or they expire.
        </p>
      ) : (
        <ul className="border-hairline bg-surface/40 overflow-hidden rounded-lg border">
          {invites.map((invite) => (
            <PendingInviteRow key={invite.id} invite={invite} />
          ))}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import { CheckIcon, ChevronDown, CopyIcon, X } from "lucide-react";

import PendingInviteRow from "./PendingInviteRow";
import InviteeCombobox from "./InviteeCombobox";
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
import type {
  CreatedInvite,
  Invitee,
  InviteRole,
} from "@/services/invites/invitesApi";
import { useBoardId } from "@/hooks/useBoardId";

// link invites only for now — no email sending, the role selector is UX only (create_invite enforces the real rule)
export default function InvitePeopleModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // own component so closing unmounts it and resets state — reopening shouldn't offer last time's link as fresh
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
  const [invitee, setInvitee] = useState<Invitee | null>(null);

  const createInvite = useCreateInvite();

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!boardId) return;

    createInvite.mutate(
      { boardId, role, expiresInDays: days, email: invitee?.email ?? null },
      {
        onSuccess: (created) => {
          setCreated(created);
          setInvitee(null);
        },
      },
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
        className="border-hairline bg-surface rounded-surface max-h-full w-[560px] max-w-full overflow-y-auto border p-5 shadow-e3 sm:p-6"
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

        <label className="text-ink mb-1.5 block text-sm font-medium">
          Names or emails
        </label>

        <InviteeCombobox
          boardId={boardId}
          value={invitee}
          onChange={setInvitee}
          disabled={!canInvite}
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
            ? invitee
              ? "Sending invite..."
              : "Creating link..."
            : invitee
              ? `Invite ${invitee.full_name || invitee.username || invitee.email}`
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

function CreatedLink({ invite }: { invite: CreatedInvite }) {
  return (
    <div className="border-brand/30 bg-brand-soft/40 mb-4 rounded-lg border p-3">
      <p className="text-ink mb-2 flex items-center gap-1.5 text-xs font-medium">
        <CheckIcon className="text-status-green size-3.5" />
        Link created. It works once, for one person.
      </p>

      <div className="flex items-center gap-2">
        {/* readOnly, not disabled — stays selectable as a fallback when clipboard API isn't available */}
        <input
          readOnly
          value={inviteUrl(invite.token, window.location.origin)}
          onFocus={(e) => e.currentTarget.select()}
          className="border-hairline bg-canvas text-ink-2 rounded-control min-w-0 flex-1 border px-2.5 py-1.5 text-xs"
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

// accepted/expired invites are filtered out in the query already
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

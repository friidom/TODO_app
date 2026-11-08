import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import Segmented from "@/components/admin/Segmented";
import { memberName } from "@/components/members/memberLabels";
import { roleLabel } from "@/components/members/roleStyles";
import DialogHeader from "@/components/ui/DialogHeader";
import { Field } from "@/components/ui/FormField";
import Modal from "@/components/ui/Modal";
import {
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_ERROR,
} from "@/components/ui/dialogChrome";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { useBoard } from "@/services/boards/useBoard";
import { useBoards } from "@/services/boards/useBoards";
import type {
  CreatedInvite,
  Invitee,
  InviteRole,
  InviteScope,
} from "@/services/invites/invitesApi";
import {
  expiryAfter,
  expiryDate,
  inviteUrl,
} from "@/services/invites/inviteLink";
import { useCreateInvite } from "@/services/invites/useCreateInvite";
import { usePendingInvites } from "@/services/invites/usePendingInvites";
import { useSpaceInvites } from "@/services/invites/useSpaceInvites";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { spaceNameOf } from "@/services/spaces/boardSpace";
import { useSpaces } from "@/services/spaces/useSpaces";
import type { IBoard } from "@/types/data";
import { cn } from "@/utils/cn";
import InviteeCombobox from "./InviteeCombobox";
import PendingInviteRow from "./PendingInviteRow";
import { copyInviteLink } from "./copyInviteLink";
import {
  DEFAULT_EXPIRY_DAYS,
  DEFAULT_INVITE_ROLE,
  EXPIRY_OPTIONS,
  INVITE_ROLE_OPTIONS,
  inviteeName,
} from "./inviteOptions";

const NO_BOARDS: IBoard[] = [];

// Opened from a board (boardId) or from a space's menu (spaceId). The role,
// the expiry and the boards are offered here; the API enforces all three.
export default function InvitePeopleModal({
  open,
  onClose,
  boardId,
  spaceId,
}: {
  open: boolean;
  onClose: () => void;
  boardId?: string;
  spaceId?: string;
}) {
  // own component so closing unmounts it and resets state — reopening shouldn't offer last time's link as fresh
  if (!open) return null;

  return <InviteDialog onClose={onClose} boardId={boardId} spaceId={spaceId} />;
}

type Sent = { invite: CreatedInvite; name: string | null };

function InviteDialog({
  onClose,
  boardId,
  spaceId,
}: {
  onClose: () => void;
  boardId?: string;
  spaceId?: string;
}) {
  const { t } = useTranslation();
  const { data: board } = useBoard(boardId);
  const { data: spaces } = useSpaces();
  const { data: boards = NO_BOARDS } = useBoards();
  const { canManageMembers, canManageAdmins } = usePermissions(boardId);

  // Only an owner's own spaces come back from /spaces, so finding it here is
  // what decides that a space invitation may be offered at all.
  const ownedSpace = spaces?.find(
    (space) => space.id === (spaceId ?? board?.space_id),
  );
  const spaceBoards = useMemo(
    () =>
      ownedSpace
        ? boards
            .filter((candidate) => candidate.space_id === ownedSpace.id)
            .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""))
        : NO_BOARDS,
    [boards, ownedSpace],
  );

  const [kind, setKind] = useState<InviteScope["kind"]>(
    boardId ? "board" : "space",
  );
  const [ticked, setTicked] = useState<string[] | null>(null);
  const [role, setRole] = useState<InviteRole>(DEFAULT_INVITE_ROLE);
  const [days, setDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
  const [invitee, setInvitee] = useState<Invitee | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const createInvite = useCreateInvite();

  const forSpace = kind === "space" && ownedSpace !== undefined;
  // every board until the owner unticks one, so a board arriving while the dialog is open is offered too
  const chosen = ticked ?? spaceBoards.map((candidate) => candidate.id);
  const scope: InviteScope | null = forSpace
    ? { kind: "space", spaceId: ownedSpace.id }
    : boardId
      ? { kind: "board", boardId }
      : null;
  // the owner of a space owns every board filed in it
  const canInvite = forSpace || canManageMembers;
  const canInviteAdmins = forSpace || canManageAdmins;

  const boardName = board?.title || t("common.untitledBoard");
  const spaceName = forSpace
    ? ownedSpace.title
    : board?.space_id
      ? spaceNameOf(board, spaces)
      : null;
  const title = t("invites.dialogTitle", {
    board: forSpace ? ownedSpace.title : boardName,
  });
  const until = expiryDate(expiryAfter(days));
  const roleName = roleLabel(role);
  const ready = canInvite && scope !== null && (!forSpace || chosen.length > 0);

  function toggle(id: string) {
    setTicked(
      chosen.includes(id)
        ? chosen.filter((other) => other !== id)
        : [...chosen, id],
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!ready) return;

    createInvite.mutate(
      {
        scope,
        boardIds: chosen,
        role,
        expiresInDays: days,
        email: invitee?.email ?? null,
      },
      {
        onSuccess: (invite) => {
          setSent({ invite, name: invitee ? inviteeName(invitee) : null });
          setInvitee(null);
        },
      },
    );
  }

  const summary = forSpace
    ? invitee
      ? t("invites.summarySpacePerson", {
          name: inviteeName(invitee),
          count: chosen.length,
          space: ownedSpace.title,
          role: roleName,
        })
      : t("invites.summarySpaceLink", {
          count: chosen.length,
          space: ownedSpace.title,
          role: roleName,
        })
    : invitee
      ? t("invites.summaryPerson", {
          name: inviteeName(invitee),
          board: boardName,
          role: roleName,
        })
      : t("invites.summaryLink", { board: boardName, role: roleName });

  return (
    <Modal title={title} onClose={onClose} width="w-[580px]">
      <form onSubmit={handleSubmit}>
        <DialogHeader
          title={title}
          description={
            forSpace
              ? t("invites.scopeSpaceHint")
              : spaceName
                ? t("invites.scopeBoardInSpace", { space: spaceName })
                : t("invites.scopeBoard")
          }
          onClose={onClose}
        />

        <div className="flex flex-col gap-5">
          {boardId && ownedSpace && (
            <div className="flex flex-col gap-1.5">
              <span className="text-ink-2 text-sm font-medium">
                {t("invites.inviteTo")}
              </span>

              <Segmented
                label={t("invites.inviteTo")}
                value={kind}
                options={[
                  { value: "board", label: t("invites.scopeThisBoard") },
                  {
                    value: "space",
                    label: t("invites.scopeWholeSpace", {
                      space: ownedSpace.title,
                    }),
                  },
                ]}
                onChange={(next) => {
                  setKind(next);
                  setSent(null);
                }}
              />
            </div>
          )}

          {forSpace && (
            <BoardPicker
              boards={spaceBoards}
              chosen={chosen}
              space={ownedSpace.title}
              onToggle={toggle}
              onAll={(all) =>
                setTicked(all ? spaceBoards.map((item) => item.id) : [])
              }
            />
          )}

          <Field label={t("invites.person")} hint={t("invites.personHint")}>
            {(id, describedBy) => (
              <InviteeCombobox
                id={id}
                describedBy={describedBy}
                scope={scope}
                chosen={forSpace ? chosen : undefined}
                value={invitee}
                onChange={(next) => {
                  setInvitee(next);
                  setSent(null);
                }}
                disabled={!canInvite}
              />
            )}
          </Field>

          <fieldset className="min-w-0">
            <legend className="text-ink-2 mb-1.5 text-sm font-medium">
              {t("invites.role")}
            </legend>

            <div className="grid gap-2 sm:grid-cols-3">
              {INVITE_ROLE_OPTIONS.map((option) => {
                const blocked = option.value === "admin" && !canInviteAdmins;

                return (
                  <label
                    key={option.value}
                    className={cn(
                      "border-hairline rounded-control has-checked:border-brand has-checked:bg-brand-wash has-focus-visible:ring-brand flex flex-col gap-1 border p-3 transition-colors has-focus-visible:ring-2",
                      blocked
                        ? "cursor-not-allowed opacity-60"
                        : "hover:border-ink/25 cursor-pointer",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="invite-role"
                        value={option.value}
                        checked={role === option.value}
                        disabled={blocked}
                        onChange={() => setRole(option.value)}
                        className="accent-brand size-3.5"
                      />
                      <span className="text-ink text-sm font-medium">
                        {t(option.labelKey)}
                      </span>
                    </span>

                    <span className="text-ink-3 text-xs leading-snug">
                      {blocked
                        ? t("invites.ownerOnlyAdmins")
                        : t(option.descriptionKey)}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-sm font-medium">
              {t("invites.expiresAfter")}
            </span>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Segmented
                label={t("invites.expiresAfter")}
                value={String(days)}
                options={EXPIRY_OPTIONS.map((option) => ({
                  value: String(option),
                  label: t("invites.days", { count: option }),
                }))}
                onChange={(next) => setDays(Number(next))}
              />

              <span className="text-ink-3 text-xs">
                {t("invites.until", { date: until })}
              </span>
            </div>
          </div>

          <p
            aria-live="polite"
            className="bg-ink/[0.03] text-ink-2 rounded-control px-3.5 py-3 text-sm leading-relaxed"
          >
            {summary} {t("invites.summaryUntil", { date: until })}
          </p>

          {sent && <SentNotice sent={sent} />}

          {createInvite.error && (
            <p role="alert" className={cn(DIALOG_ERROR, "mt-0")}>
              {createInvite.error.message}
            </p>
          )}
        </div>

        {forSpace ? (
          <SpacePending spaceId={ownedSpace.id} />
        ) : (
          <BoardPending
            boardId={boardId}
            canInvite={canManageMembers}
            ownedSpaceId={ownedSpace?.id}
          />
        )}

        {/* -bottom-5 cancels the panel's padding, so the footer pins to its edge */}
        <footer className="border-hairline bg-surface sticky -bottom-5 z-10 -mx-5 mt-6 -mb-5 flex items-center justify-end gap-2 border-t px-5 py-3.5">
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            {t("common.close")}
          </button>

          <button
            type="submit"
            disabled={!ready || createInvite.isPending}
            className={DIALOG_CONFIRM}
          >
            {createInvite.isPending
              ? invitee
                ? t("invites.sending")
                : t("invites.creatingLink")
              : invitee
                ? t("invites.send")
                : t("invites.createLink")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function BoardPicker({
  boards,
  chosen,
  space,
  onToggle,
  onAll,
}: {
  boards: IBoard[];
  chosen: readonly string[];
  space: string;
  onToggle: (id: string) => void;
  onAll: (all: boolean) => void;
}) {
  const { t } = useTranslation();
  const all = boards.length > 0 && chosen.length === boards.length;

  return (
    <fieldset className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <legend className="text-ink-2 text-sm font-medium">
          {t("invites.boards")}{" "}
          <span className="text-ink-3 font-normal tabular-nums">
            {t("invites.boardsChosen", {
              count: chosen.length,
              total: boards.length,
            })}
          </span>
        </legend>

        {boards.length > 1 && (
          <button
            type="button"
            onClick={() => onAll(!all)}
            className="text-brand hover:bg-brand-wash focus-visible:ring-brand rounded px-1.5 py-0.5 text-xs font-medium outline-none focus-visible:ring-2"
          >
            {all ? t("invites.chooseNone") : t("invites.chooseAll")}
          </button>
        )}
      </div>

      {boards.length === 0 ? (
        <p className="border-hairline text-ink-3 rounded-control border border-dashed px-3 py-3 text-xs">
          {t("invites.spaceEmpty")}
        </p>
      ) : (
        <ul className="border-hairline divide-hairline rounded-control max-h-44 divide-y overflow-y-auto border">
          {boards.map((board) => (
            <li key={board.id}>
              <label className="hover:bg-ink/[0.03] flex cursor-pointer items-center gap-2.5 px-3 py-2">
                <input
                  type="checkbox"
                  checked={chosen.includes(board.id)}
                  onChange={() => onToggle(board.id)}
                  className="accent-brand size-3.5"
                />
                <span className="text-ink min-w-0 flex-1 truncate text-sm">
                  {board.title || t("common.untitledBoard")}
                </span>
                <span className="text-ink-3 shrink-0 text-xs">
                  {board.key_prefix}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <p className="text-ink-3 mt-1.5 text-xs">
        {t("invites.laterBoards", { space })}
      </p>
    </fieldset>
  );
}

function SentNotice({ sent }: { sent: Sent }) {
  const { t } = useTranslation();
  const url = inviteUrl(sent.invite.token, window.location.origin);

  return (
    <div className="border-status-green/30 bg-status-green/10 rounded-control border px-3.5 py-3">
      <p className="text-ink flex items-center gap-1.5 text-sm font-medium">
        <CheckIcon className="text-status-green size-4 shrink-0" />
        {sent.name
          ? t("invites.sentTo", { name: sent.name })
          : t("invites.linkCreated")}
      </p>

      {sent.name && (
        <p className="text-ink-2 mt-1 text-xs">{t("invites.sentHint")}</p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {/* readOnly, not disabled — stays selectable as a fallback when clipboard API isn't available */}
        <input
          readOnly
          aria-label={t("invites.linkLabel")}
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="border-hairline bg-surface text-ink-2 rounded-control h-8 min-w-0 flex-1 border px-2.5 text-xs"
        />

        <button
          type="button"
          onClick={() => void copyInviteLink(sent.invite.token)}
          className={cn(DIALOG_CANCEL, "border-hairline h-8 border")}
        >
          <CopyIcon className="size-3.5" />
          {t("invites.copyLink")}
        </button>
      </div>
    </div>
  );
}

function PendingSection({
  count,
  isPending,
  failed,
  children,
}: {
  count: number;
  isPending: boolean;
  failed: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <section className="border-hairline mt-6 border-t pt-5">
      <h3 className="text-ink mb-2.5 flex items-center gap-2 text-sm font-semibold">
        {t("invites.pending")}
        {count > 0 && (
          <span className="bg-ink/[0.06] text-ink-2 rounded-full px-1.5 text-xs tabular-nums">
            {count}
          </span>
        )}
      </h3>

      {isPending ? (
        <div className="space-y-2 py-1" aria-busy>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : failed ? (
        <p className="border-status-red/30 text-status-red rounded-control border border-dashed px-3 py-3 text-xs">
          {t("invites.pendingLoadFailed")}
        </p>
      ) : count === 0 ? (
        <p className="border-hairline text-ink-3 rounded-control border border-dashed px-3 py-3 text-xs">
          {t("invites.pendingEmpty")}
        </p>
      ) : (
        <ul className="border-hairline divide-hairline rounded-control divide-y border">
          {children}
        </ul>
      )}
    </section>
  );
}

// accepted/expired invites are filtered out in the query already
function BoardPending({
  boardId,
  canInvite,
  ownedSpaceId,
}: {
  boardId: string | undefined;
  canInvite: boolean;
  ownedSpaceId: string | undefined;
}) {
  const { t } = useTranslation();
  const {
    data: invites = [],
    isPending,
    error,
  } = usePendingInvites(boardId, canInvite);
  const { data: members } = useBoardMembers(boardId);

  const nameOf = useMemo(
    () =>
      new Map((members ?? []).map((member) => [member.id, memberName(member)])),
    [members],
  );

  return (
    <PendingSection
      count={invites.length}
      isPending={canInvite && isPending}
      failed={Boolean(error)}
    >
      {invites.map((invite) => (
        <PendingInviteRow
          key={invite.id}
          invite={invite}
          inviter={
            invite.created_by ? (nameOf.get(invite.created_by) ?? null) : null
          }
          note={
            invite.space_id
              ? t("invites.viaSpace", {
                  space: invite.space_title ?? "",
                  count: invite.board_count,
                })
              : null
          }
          canRevoke={
            invite.space_id === null || invite.space_id === ownedSpaceId
          }
        />
      ))}
    </PendingSection>
  );
}

function SpacePending({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const {
    data: invites = [],
    isPending,
    error,
  } = useSpaceInvites(spaceId, true);

  return (
    <PendingSection
      count={invites.length}
      isPending={isPending}
      failed={Boolean(error)}
    >
      {invites.map((invite) => (
        <PendingInviteRow
          key={invite.id}
          invite={invite}
          inviter={null}
          note={invite.boards
            .map((board) => board.title || t("common.untitledBoard"))
            .join(", ")}
          canRevoke
        />
      ))}
    </PendingSection>
  );
}

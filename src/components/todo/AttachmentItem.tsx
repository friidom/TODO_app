import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FloatingPortal } from "@floating-ui/react";
import {
  CircleAlertIcon,
  DownloadIcon,
  Loader2,
  MoreHorizontal,
  Trash2Icon,
} from "lucide-react";

import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/services/auth/useAuth";
import { canDeleteAttachment } from "@/services/members/permissions";
import {
  fileKind,
  formatBytes,
  previewKind,
} from "@/services/attachments/fileMeta";
import { useAttachmentUrl } from "@/services/attachments/useAttachmentUrl";
import { useDeleteAttachment } from "@/services/attachments/useDeleteAttachment";
import type { Attachment } from "@/types/data";
import { cn } from "@/utils/cn";

import { KIND_ICONS } from "./attachmentIcons";
import { useCardPopover } from "./TodoItem/useCardPopover";

// Below sm, date/size are hidden (removed from grid flow), not squeezed.
export const ATTACHMENT_GRID =
  "grid items-center gap-x-3 px-3 grid-cols-[2rem_minmax(0,1fr)_1.5rem] sm:grid-cols-[2rem_minmax(0,1fr)_6.5rem_4.5rem_1.5rem]";

const ROW = "border-hairline h-12 border-b last:border-b-0";

// Local state, not an optimistic cache row — useUploadAttachment isn't optimistic since a file isn't attached until stored.
export interface PendingUpload {
  key: string;
  file: File;
  error?: string;
}

export function AttachmentTableHeader() {
  return (
    <div
      role="row"
      className={cn(
        ATTACHMENT_GRID,
        "border-hairline text-ink-3/70 text-micro bg-surface/40 h-8 border-b font-medium tracking-[0.08em] uppercase",
      )}
    >
      <span role="columnheader" className="col-span-2">
        Name
      </span>

      <span role="columnheader" className="hidden sm:block">
        Date added
      </span>

      <span role="columnheader" className="hidden sm:block">
        Size
      </span>

      <span role="columnheader" className="hidden sm:block">
        {/* sr-only on the nested span, not the grid item — position:absolute would drop the cell out of the grid. */}
        <span className="sr-only">Actions</span>
      </span>
    </div>
  );
}

function dateAdded(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export function AttachmentRow({
  attachment,
  todoId,
  thumbUrl,
  onPreview,
}: {
  attachment: Attachment;
  todoId: string;
  thumbUrl: string | undefined;
  onPreview: () => void;
}) {
  const actions = useRowActions(attachment, todoId);

  const { i18n } = useTranslation();

  const added = dateAdded(attachment.created_at, i18n.language);

  if (actions.confirming) {
    return (
      <div
        role="row"
        className={cn(ROW, "bg-status-red/[0.04] flex items-center px-3")}
      >
        <ConfirmStrip actions={actions} />
      </div>
    );
  }

  return (
    <div
      role="row"
      className={cn(
        ATTACHMENT_GRID,
        ROW,
        "hover:bg-ink/[0.035] transition-colors",
      )}
    >
      <AttachmentThumb
        attachment={attachment}
        url={thumbUrl}
        onClick={onPreview}
      />

      <div role="cell" className="min-w-0">
        <button
          type="button"
          onClick={onPreview}
          title={attachment.filename}
          className="text-ink hover:text-brand focus-visible:ring-brand text-meta block w-full truncate rounded text-left font-medium transition-colors outline-none focus-visible:ring-2"
        >
          {attachment.filename}
        </button>
      </div>

      <span
        role="cell"
        title={new Date(attachment.created_at).toLocaleString(i18n.language)}
        className="text-ink-3/80 text-mini hidden truncate tabular-nums sm:block"
      >
        {added}
      </span>

      <span
        role="cell"
        className="text-ink-3 text-mini hidden tabular-nums sm:block"
      >
        {formatBytes(attachment.size_bytes)}
      </span>

      <div role="cell" className="flex">
        <AttachmentMenu actions={actions} />
      </div>
    </div>
  );
}

export function AttachmentCard({
  attachment,
  todoId,
  thumbUrl,
  onPreview,
}: {
  attachment: Attachment;
  todoId: string;
  thumbUrl: string | undefined;
  onPreview: () => void;
}) {
  const actions = useRowActions(attachment, todoId);

  const { i18n } = useTranslation();

  const added = dateAdded(attachment.created_at, i18n.language);

  return (
    <li className="border-hairline rounded-card hover:border-ink/20 overflow-hidden border transition-colors">
      <AttachmentThumb
        attachment={attachment}
        url={thumbUrl}
        onClick={onPreview}
        variant="card"
      />

      <div className="border-hairline flex items-center gap-1 border-t px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onPreview}
            title={attachment.filename}
            className="text-ink hover:text-brand focus-visible:ring-brand text-mini block w-full truncate rounded text-left font-medium transition-colors outline-none focus-visible:ring-2"
          >
            {attachment.filename}
          </button>

          <p className="text-ink-3 text-micro truncate tabular-nums">
            {formatBytes(attachment.size_bytes)} · {added}
          </p>
        </div>

        {actions.confirming ? (
          <ConfirmStrip actions={actions} compact />
        ) : (
          <AttachmentMenu actions={actions} />
        )}
      </div>
    </li>
  );
}

// Shared by row and card so the delete rule can't drift between the two.
function useRowActions(attachment: Attachment, todoId: string) {
  const { user } = useAuth();
  const { role } = usePermissions();
  const remove = useDeleteAttachment();
  const link = useAttachmentUrl();

  const [confirming, setConfirming] = useState(false);

  function download() {
    link.mutate(
      {
        storagePath: attachment.storage_path,
        filename: attachment.filename,
      },
      {
        onSuccess: (url) => {
          // location.href, not window.open — popup blockers stop a popup opened after an async gap.
          window.location.href = url;
        },
      },
    );

    // No onError — falls through to the global MutationCache toast.
  }

  return {
    filename: attachment.filename,
    confirming,
    setConfirming,
    downloading: link.isPending,
    removing: remove.isPending,
    mayDelete: canDeleteAttachment(role, user?.id, attachment.uploader_id),
    download,
    remove: () =>
      remove.mutate({
        id: attachment.id,
        storagePath: attachment.storage_path,
        todoId,
      }),
  };
}

type RowActions = ReturnType<typeof useRowActions>;

// Inline, not a modal — avoids a second Escape listener fighting the task modal's.
function ConfirmStrip({
  actions,
  compact,
}: {
  actions: RowActions;
  compact?: boolean;
}) {
  return (
    <span
      className="flex min-w-0 items-center gap-2 text-xs"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;

        event.preventDefault();
        actions.setConfirming(false);
      }}
    >
      {!compact && (
        <span className="text-ink-2 min-w-0 truncate">
          Remove <span className="font-medium">{actions.filename}</span>?
        </span>
      )}

      <button
        type="button"
        autoFocus
        onClick={actions.remove}
        disabled={actions.removing}
        className="text-status-red shrink-0 font-medium disabled:opacity-45"
      >
        {actions.removing ? "Removing…" : "Remove"}
      </button>

      <button
        type="button"
        onClick={() => actions.setConfirming(false)}
        className="text-ink-3 hover:text-ink shrink-0 font-medium"
      >
        Keep
      </button>
    </span>
  );
}

// A menu, not two icon buttons — keeps a misclick near the filename from triggering delete.
function AttachmentMenu({ actions }: { actions: RowActions }) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        aria-label={`Actions for ${actions.filename}`}
        title="More actions"
        className="text-ink-3 hover:bg-ink/10 hover:text-ink focus-visible:ring-brand grid size-6 shrink-0 place-items-center rounded transition-colors outline-none focus-visible:ring-2"
      >
        {actions.downloading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <MoreHorizontal className="size-4" />
        )}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={`Actions for ${actions.filename}`}
            className="border-hairline bg-elevated rounded-card shadow-e2 z-[70] w-44 border p-1"
          >
            <MenuItem
              icon={DownloadIcon}
              label="Download"
              onClick={() => {
                actions.download();
                close();
              }}
            />

            {actions.mayDelete && (
              <>
                <div className="bg-hairline my-1 h-px" />

                <MenuItem
                  icon={Trash2Icon}
                  label="Delete"
                  danger
                  onClick={() => {
                    actions.setConfirming(true);
                    close();
                  }}
                />
              </>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

export function MenuItem({
  icon: Icon,
  label,
  badge,
  danger,
  disabled,
  busy,
  onClick,
}: {
  icon: typeof DownloadIcon;
  label: string;
  badge?: number;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "rounded-control flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors outline-none disabled:opacity-45",
        danger
          ? "text-status-red hover:bg-status-red/15 focus-visible:bg-status-red/15 font-medium"
          : "text-ink hover:bg-ink/10 focus-visible:bg-ink/10",
      )}
    >
      {busy ? (
        <Loader2
          className={cn(
            "size-4 shrink-0 animate-spin",
            !danger && "text-ink-3",
          )}
        />
      ) : (
        <Icon className={cn("size-4 shrink-0", !danger && "text-ink-3")} />
      )}

      <span className="min-w-0 flex-1 truncate text-left">{label}</span>

      {badge !== undefined && (
        <span className="bg-ink/10 text-ink-3 text-micro shrink-0 rounded px-1.5 py-0.5 font-semibold tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

// Full-size image, not a generated thumbnail — no image transform on this Supabase plan. loading="lazy" blunts the cost.
function AttachmentThumb({
  attachment,
  url,
  onClick,
  variant = "row",
}: {
  attachment: Attachment;
  url: string | undefined;
  onClick: () => void;
  variant?: "row" | "card";
}) {
  const [broken, setBroken] = useState(false);

  const Icon = KIND_ICONS[fileKind(attachment.mime_type, attachment.filename)];
  const showImage =
    previewKind(attachment.mime_type) === "image" && url && !broken;

  const card = variant === "card";

  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={-1}
      aria-hidden
      // Not a tab stop — the filename beside it is the same action with a readable label.
      className={cn(
        "bg-ink/[0.04] grid place-items-center overflow-hidden outline-none",
        card ? "aspect-video w-full" : "size-8 shrink-0 rounded",
      )}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className={cn("object-cover", card ? "size-full" : "size-8")}
        />
      ) : (
        <Icon className={cn("text-ink-3", card ? "size-6" : "size-4")} />
      )}
    </button>
  );
}

export function PendingRow({
  row,
  onRetry,
  onDismiss,
}: {
  row: PendingUpload;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const failed = Boolean(row.error);

  return (
    <div
      role="row"
      className={cn(
        ROW,
        "flex items-center gap-3 px-3",
        failed && "bg-status-red/[0.04]",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center">
        {failed ? (
          <CircleAlertIcon className="text-status-red size-4" />
        ) : (
          <Loader2 className="text-ink-3 size-4 animate-spin" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          title={row.file.name}
          className={cn(
            "text-meta truncate font-medium",
            failed ? "text-ink-2" : "text-ink-3",
          )}
        >
          {row.file.name}
        </p>

        {row.error && (
          <p className="text-status-red text-micro truncate">{row.error}</p>
        )}
      </div>

      {failed ? (
        <span className="flex shrink-0 items-center gap-2 text-xs">
          <button
            type="button"
            onClick={onRetry}
            className="text-brand font-medium"
          >
            Retry
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="text-ink-3 hover:text-ink font-medium"
          >
            Dismiss
          </button>
        </span>
      ) : (
        // Text, not a progress bar — supabase-js exposes no upload progress events.
        <span className="text-ink-3 text-mini shrink-0">Uploading…</span>
      )}
    </div>
  );
}

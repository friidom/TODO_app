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
import IconButton from "@/components/ui/IconButton";
import {
  MENU_ITEM,
  MENU_ITEM_DANGER,
  MENU_SEPARATOR,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { canDeleteAttachment } from "@/services/members/permissions";
import {
  fileKind,
  formatBytes,
  previewKind,
} from "@/services/attachments/fileMeta";
import { useAttachmentObjectUrl } from "@/services/attachments/useAttachmentObjectUrl";
import { useDownloadAttachment } from "@/services/attachments/useDownloadAttachment";
import { useDeleteAttachment } from "@/services/attachments/useDeleteAttachment";
import type { Attachment } from "@/types/data";
import { cn } from "@/utils/cn";

import { KIND_ICONS } from "./attachmentIcons";
import {
  COUNT_CHIP,
  INLINE_ACTION,
  INLINE_ACTION_BRAND,
  INLINE_ACTION_DANGER,
  TABLE_HEAD,
  TABLE_ROW,
} from "./detailChrome";
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
    <div role="row" className={cn(ATTACHMENT_GRID, TABLE_HEAD)}>
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
  onPreview,
}: {
  attachment: Attachment;
  todoId: string;
  onPreview: () => void;
}) {
  const actions = useRowActions(attachment, todoId);

  const { i18n } = useTranslation();

  const added = dateAdded(attachment.created_at, i18n.language);

  if (actions.confirming) {
    return (
      <div
        role="row"
        className={cn(ROW, "bg-status-red/[0.06] flex items-center px-3")}
      >
        <ConfirmStrip actions={actions} />
      </div>
    );
  }

  return (
    <div role="row" className={cn(ATTACHMENT_GRID, TABLE_ROW, "h-12")}>
      <AttachmentThumb attachment={attachment} onClick={onPreview} />

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
        className="text-ink-3 text-mini hidden truncate tabular-nums sm:block"
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
  onPreview,
}: {
  attachment: Attachment;
  todoId: string;
  onPreview: () => void;
}) {
  const actions = useRowActions(attachment, todoId);

  const { i18n } = useTranslation();

  const added = dateAdded(attachment.created_at, i18n.language);

  return (
    <li className="border-hairline rounded-card hover:border-ink/20 overflow-hidden border transition-colors duration-150">
      <AttachmentThumb
        attachment={attachment}
        onClick={onPreview}
        variant="card"
      />

      <div className="border-hairline flex items-center gap-1 border-t py-1.5 pr-1 pl-2">
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
  const download = useDownloadAttachment();

  const [confirming, setConfirming] = useState(false);

  return {
    filename: attachment.filename,
    confirming,
    setConfirming,
    downloading: download.isPending,
    removing: remove.isPending,
    mayDelete: canDeleteAttachment(role, user?.id, attachment.uploader_id),
    // No onError — falls through to the global MutationCache toast.
    download: () =>
      download.mutate({
        todoId,
        id: attachment.id,
        filename: attachment.filename,
      }),
    remove: () => remove.mutate({ id: attachment.id, todoId }),
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
      className="flex min-w-0 items-center gap-1 text-xs"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;

        event.preventDefault();
        actions.setConfirming(false);
      }}
    >
      {!compact && (
        <span className="text-ink-2 text-meta mr-1 min-w-0 truncate">
          Remove <span className="font-medium">{actions.filename}</span>?
        </span>
      )}

      <button
        type="button"
        autoFocus
        onClick={actions.remove}
        disabled={actions.removing}
        className={INLINE_ACTION_DANGER}
      >
        {actions.removing ? "Removing…" : "Remove"}
      </button>

      <button
        type="button"
        onClick={() => actions.setConfirming(false)}
        className={INLINE_ACTION}
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
      <IconButton
        label={`Actions for ${actions.filename}`}
        size="xs"
        tooltip={false}
        title="More actions"
        aria-haspopup="menu"
        {...triggerProps}
      >
        {actions.downloading ? (
          <Loader2 className="animate-spin" />
        ) : (
          <MoreHorizontal className="size-4" />
        )}
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={`Actions for ${actions.filename}`}
            className={cn(POPOVER_PANEL, "z-[70] w-44")}
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
                <div className={MENU_SEPARATOR} />

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
      className={danger ? MENU_ITEM_DANGER : MENU_ITEM}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Icon />}

      <span className="min-w-0 flex-1 truncate">{label}</span>

      {badge !== undefined && <span className={COUNT_CHIP}>{badge}</span>}
    </button>
  );
}

// Full-size image, not a generated thumbnail — the endpoint streams the stored
// object and there is no resizing behind it. loading="lazy" blunts the cost.
function AttachmentThumb({
  attachment,
  onClick,
  variant = "row",
}: {
  attachment: Attachment;
  onClick: () => void;
  variant?: "row" | "card";
}) {
  const [broken, setBroken] = useState(false);

  const isImage = previewKind(attachment.mime_type) === "image";
  const { url } = useAttachmentObjectUrl(
    attachment.todo_id,
    attachment.id,
    isImage,
  );

  const Icon = KIND_ICONS[fileKind(attachment.mime_type, attachment.filename)];
  const showImage = isImage && url && !broken;

  const card = variant === "card";

  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={-1}
      aria-hidden
      // Not a tab stop — the filename beside it is the same action with a readable label.
      className={cn(
        "bg-wash grid place-items-center overflow-hidden outline-none",
        card ? "aspect-video w-full" : "size-8 shrink-0 rounded-[6px]",
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
        failed && "bg-status-red/[0.06]",
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
        <span className="flex shrink-0 items-center gap-1 text-xs">
          <button
            type="button"
            onClick={onRetry}
            className={INLINE_ACTION_BRAND}
          >
            Retry
          </button>

          <button type="button" onClick={onDismiss} className={INLINE_ACTION}>
            Dismiss
          </button>
        </span>
      ) : (
        // Text, not a progress bar — fetch exposes no upload progress events.
        <span className="text-ink-3 text-mini shrink-0">Uploading…</span>
      )}
    </div>
  );
}

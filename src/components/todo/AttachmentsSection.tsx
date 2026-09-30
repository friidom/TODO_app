import { useTranslation } from "react-i18next";
import { useMemo, useRef, useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import {
  CircleAlertIcon,
  DownloadIcon,
  LayoutGridIcon,
  ListIcon,
  MoreHorizontal,
  PaperclipIcon,
  PlusIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import { MENU_SEPARATOR, POPOVER_PANEL } from "@/components/ui/controlChrome";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/services/auth/useAuth";
import { canDeleteAttachment } from "@/services/members/permissions";
import {
  ATTACHMENT_FILTERS,
  EMPTY_FILTER_LABELS,
  FILTER_LABELS,
  filterCounts,
  matchesFilter,
  type AttachmentFilter,
} from "@/services/attachments/attachmentFilter";
import {
  MAX_ATTACHMENT_BYTES,
  formatBytes,
} from "@/services/attachments/fileMeta";
import { useAttachments } from "@/services/attachments/useAttachments";
import {
  useDeleteAllAttachments,
  useDownloadAllAttachments,
} from "@/services/attachments/useBulkAttachments";
import { useUploadAttachment } from "@/services/attachments/useUploadAttachment";
import type { Attachment } from "@/types/data";
import { cn } from "@/utils/cn";

import AttachmentPreview from "./AttachmentPreview";
import SectionHeader, { EmptyLine } from "./SectionHeader";
import {
  INLINE_ACTION,
  INLINE_ACTION_BRAND,
  INLINE_ACTION_DANGER,
  SEGMENT,
  SEGMENT_ACTIVE,
  SEGMENT_IDLE,
  SEGMENTED,
  TABLE,
} from "./detailChrome";
import {
  AttachmentCard,
  AttachmentRow,
  AttachmentTableHeader,
  MenuItem,
  PendingRow,
  type PendingUpload,
} from "./AttachmentItem";
import { useCardPopover } from "./TodoItem/useCardPopover";

type AttachmentView = "list" | "grid";

// Shell only — row/card/menu live in AttachmentItem.tsx, tab taxonomy in attachmentFilter.ts, bulk actions in useBulkAttachments.ts.
export default function AttachmentsSection({ todoId }: { todoId: string }) {
  const {
    data: attachments,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useAttachments(todoId);

  const { t } = useTranslation();
  const { canAttach, role } = usePermissions();
  const { user } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [previewing, setPreviewing] = useState<Attachment | null>(null);
  const [filter, setFilter] = useState<AttachmentFilter>("all");
  const [view, setView] = useState<AttachmentView>("list");
  const [confirmingAll, setConfirmingAll] = useState(false);

  const upload = useUploadAttachment();
  const downloadAll = useDownloadAllAttachments();
  const deleteAll = useDeleteAllAttachments();
  const fileInput = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => attachments ?? [], [attachments]);
  const count = rows.length;

  const counts = useMemo(() => filterCounts(rows), [rows]);

  const visible = useMemo(
    () => rows.filter((row) => matchesFilter(row, filter)),
    [rows, filter],
  );

  // "All" means what's on screen (the current tab) — the count on the menu item must match what's visible.
  const deletable = useMemo(
    () =>
      visible.filter((row) =>
        canDeleteAttachment(role, user?.id, row.uploader_id),
      ),
    [visible, role, user?.id],
  );

  function startUpload(file: File, key: string = crypto.randomUUID()) {
    // UX only — file_size_limit on the bucket is the real enforcement.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setPending((old) => [
        ...old.filter((row) => row.key !== key),
        {
          key,
          file,
          error: t("attachments.tooLarge", {
            size: formatBytes(MAX_ATTACHMENT_BYTES),
          }),
        },
      ]);

      return;
    }

    setPending((old) => [
      ...old.filter((row) => row.key !== key),
      { key, file },
    ]);

    upload.mutate(
      { todoId, file },
      {
        onSuccess: () =>
          setPending((old) => old.filter((row) => row.key !== key)),
        onError: (uploadError) =>
          setPending((old) =>
            old.map((row) =>
              row.key === key
                ? {
                    ...row,
                    error: messageOf(
                      uploadError,
                      t("attachments.uploadFailed"),
                    ),
                  }
                : row,
            ),
          ),
      },
    );
  }

  function handlePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);

    setCollapsed(false);
    setFilter("all");
    picked.forEach((file) => startUpload(file));

    // Cleared so picking the same file twice in a row still fires change.
    event.target.value = "";
  }

  const nothingAtAll = count === 0 && pending.length === 0;
  const emptyTab =
    !nothingAtAll && visible.length === 0 && pending.length === 0;

  return (
    <section>
      <SectionHeader
        title={t("attachments.title")}
        // Total count, not the filtered subset — a heading that shrinks with the tab would look like lost files.
        count={count > 0 ? count : null}
        collapse={{
          collapsed,
          onToggle: () => setCollapsed((open) => !open),
          noun: t("attachments.title"),
        }}
        actions={
          <>
            {count > 0 && (
              <FilterTabs value={filter} counts={counts} onChange={setFilter} />
            )}

            {canAttach && (
              <>
                <IconButton
                  label={t("attachments.add")}
                  onClick={() => fileInput.current?.click()}
                >
                  <PlusIcon />
                </IconButton>

                {/* No `accept` — the bucket has no mime allow-list to mirror. */}
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  onChange={handlePicked}
                />
              </>
            )}

            {count > 0 && (
              <SectionMenu
                view={view}
                onToggleView={() =>
                  setView((current) => (current === "list" ? "grid" : "list"))
                }
                downloadCount={visible.length}
                downloading={downloadAll.isPending}
                onDownloadAll={() => downloadAll.mutate(visible)}
                deleteCount={deletable.length}
                onDeleteAll={() => setConfirmingAll(true)}
              />
            )}
          </>
        }
      />

      {!collapsed && (
        <>
          {confirmingAll && (
            <ConfirmDeleteAll
              count={deletable.length}
              busy={deleteAll.isPending}
              onCancel={() => setConfirmingAll(false)}
              onConfirm={() =>
                deleteAll.mutate(
                  { attachments: deletable, todoId },
                  { onSuccess: () => setConfirmingAll(false) },
                )
              }
            />
          )}

          {isPending ? (
            <div className="space-y-2" aria-busy>
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="border-hairline rounded-card text-meta flex flex-wrap items-center gap-2 border px-3 py-2.5">
              <CircleAlertIcon className="text-status-red size-4 shrink-0" />

              <span className="text-ink-2 min-w-0 flex-1">
                {messageOf(error, t("attachments.loadFailed"))}
              </span>

              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className={cn(
                  INLINE_ACTION_BRAND,
                  "flex items-center gap-1.5 px-2 py-1 text-xs",
                )}
              >
                <RotateCwIcon
                  className={cn("size-3.5", isFetching && "animate-spin")}
                />
                {t("common.retry")}
              </button>
            </div>
          ) : nothingAtAll ? (
            <EmptyLine icon={PaperclipIcon}>
              <span>
                {t("attachments.none")}
                {canAttach && ` ${t("attachments.addHint")}`}
              </span>
            </EmptyLine>
          ) : emptyTab ? (
            <EmptyLine icon={PaperclipIcon}>
              <span>
                {filter === "all"
                  ? t("attachments.none")
                  : EMPTY_FILTER_LABELS[filter]}
              </span>

              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(INLINE_ACTION_BRAND, "text-xs")}
              >
                {t("review.showAll", { count })}
              </button>
            </EmptyLine>
          ) : view === "grid" ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visible.map((attachment) => (
                <AttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                  todoId={todoId}
                  onPreview={() => setPreviewing(attachment)}
                />
              ))}
            </ul>
          ) : (
            <div
              role="table"
              aria-label={t("attachments.title")}
              className={TABLE}
            >
              <AttachmentTableHeader />

              {visible.map((attachment) => (
                <AttachmentRow
                  key={attachment.id}
                  attachment={attachment}
                  todoId={todoId}
                  onPreview={() => setPreviewing(attachment)}
                />
              ))}

              {pending.map((row) => (
                <PendingRow
                  key={row.key}
                  row={row}
                  onRetry={() => startUpload(row.file, row.key)}
                  onDismiss={() =>
                    setPending((old) => old.filter((it) => it.key !== row.key))
                  }
                />
              ))}
            </div>
          )}

          {view === "grid" && pending.length > 0 && (
            <div
              role="table"
              aria-label={t("attachments.uploading")}
              className={cn(TABLE, "mt-2")}
            >
              {pending.map((row) => (
                <PendingRow
                  key={row.key}
                  row={row}
                  onRetry={() => startUpload(row.file, row.key)}
                  onDismiss={() =>
                    setPending((old) => old.filter((it) => it.key !== row.key))
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {previewing && (
        // Keyed by file id so opening a different one remounts rather than carrying over zoom state.
        <AttachmentPreview
          key={previewing.id}
          attachment={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </section>
  );
}

// Empty tabs are dimmed, never disabled — a disabled control can't explain itself, the empty state can.
function FilterTabs({
  value,
  counts,
  onChange,
}: {
  value: AttachmentFilter;
  counts: Record<AttachmentFilter, number>;
  onChange: (next: AttachmentFilter) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="tablist"
      aria-label={t("attachments.filterLabel")}
      className={cn(SEGMENTED, "min-w-0 shrink overflow-x-auto")}
    >
      {ATTACHMENT_FILTERS.map((key) => {
        const active = key === value;
        const empty = counts[key] === 0;

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={cn(
              SEGMENT,
              active
                ? SEGMENT_ACTIVE
                : empty
                  ? "text-ink-3/60 hover:text-ink-3"
                  : SEGMENT_IDLE,
            )}
          >
            {FILTER_LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}

function SectionMenu({
  view,
  onToggleView,
  downloadCount,
  downloading,
  onDownloadAll,
  deleteCount,
  onDeleteAll,
}: {
  view: AttachmentView;
  onToggleView: () => void;
  downloadCount: number;
  downloading: boolean;
  onDownloadAll: () => void;
  deleteCount: number;
  onDeleteAll: () => void;
}) {
  const { t } = useTranslation();
  const { mounted, close, triggerProps, panelProps } = useCardPopover();

  return (
    <>
      <IconButton
        label={t("attachments.actions")}
        aria-haspopup="menu"
        {...triggerProps}
      >
        <MoreHorizontal />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={t("attachments.actions")}
            className={cn(POPOVER_PANEL, "z-[70] w-56")}
          >
            <MenuItem
              icon={view === "list" ? LayoutGridIcon : ListIcon}
              label={
                view === "list"
                  ? t("attachments.gridView")
                  : t("attachments.listView")
              }
              onClick={() => {
                onToggleView();
                close();
              }}
            />

            <div className={MENU_SEPARATOR} />

            <MenuItem
              icon={DownloadIcon}
              label={t("attachments.downloadAll")}
              badge={downloadCount}
              busy={downloading}
              disabled={downloadCount === 0}
              onClick={() => {
                onDownloadAll();
                close();
              }}
            />

            {deleteCount > 0 && (
              <MenuItem
                icon={Trash2Icon}
                label={t("attachments.deleteAll")}
                badge={deleteCount}
                danger
                onClick={() => {
                  onDeleteAll();
                  close();
                }}
              />
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// Inline, not a dialog — TaskDetailModal's Escape listener would otherwise close the task too.
function ConfirmDeleteAll({
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="border-status-red/30 bg-status-red/[0.06] rounded-card mb-2 flex flex-wrap items-center gap-1 border px-3 py-2 text-xs"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;

        event.preventDefault();
        onCancel();
      }}
    >
      <CircleAlertIcon className="text-status-red size-4 shrink-0" />

      <span className="text-ink-2 text-meta mx-1 min-w-0 flex-1">
        {t("attachments.deleteAllConfirm", { count })}
      </span>

      <button
        type="button"
        autoFocus
        onClick={onConfirm}
        disabled={busy}
        className={INLINE_ACTION_DANGER}
      >
        {busy ? t("common.deleting") : t("attachments.deleteAll")}
      </button>

      <button type="button" onClick={onCancel} className={INLINE_ACTION}>
        {t("common.cancel")}
      </button>
    </div>
  );
}

function messageOf(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;

  return fallback;
}

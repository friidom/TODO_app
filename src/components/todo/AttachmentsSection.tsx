import { useMemo, useRef, useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
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
          error: `Larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
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
              row.key === key ? { ...row, error: messageOf(uploadError) } : row,
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
    <section className="mt-8">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} attachments`}
          onClick={() => setCollapsed((open) => !open)}
          className="text-ink-3 hover:text-ink hover:bg-ink/10 focus-visible:ring-brand -ml-1 rounded p-1 transition-colors outline-none focus-visible:ring-2"
        >
          {collapsed ? (
            <ChevronRightIcon className="size-4" />
          ) : (
            <ChevronDownIcon className="size-4" />
          )}
        </button>

        <h3 className="text-ink-3 text-mini font-semibold tracking-[0.08em] uppercase">
          Attachments
        </h3>

        {/* Total count, not the filtered subset — a heading that shrinks with the tab would look like lost files. */}
        {count > 0 && (
          <span className="bg-ink/10 text-ink-3 text-mini shrink-0 rounded px-1.5 py-0.5 font-semibold tabular-nums">
            {count}
          </span>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-1">
          {count > 0 && (
            <FilterTabs value={filter} counts={counts} onChange={setFilter} />
          )}

          {canAttach && (
            <>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                aria-label="Add attachment"
                title="Add attachment"
                className="text-ink-3 hover:bg-ink/10 hover:text-ink focus-visible:ring-brand grid size-7 shrink-0 place-items-center rounded transition-colors outline-none focus-visible:ring-2"
              >
                <PlusIcon className="size-4" />
              </button>

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
        </div>
      </div>

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
            <div className="border-hairline rounded-card flex flex-wrap items-center gap-2 border px-3 py-2.5 text-sm">
              <CircleAlertIcon className="text-status-red size-4 shrink-0" />

              <span className="text-ink-2 min-w-0 flex-1">
                {messageOf(error, "Could not load attachments.")}
              </span>

              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="text-brand hover:bg-brand-soft rounded-control flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs font-medium transition-colors disabled:opacity-45"
              >
                <RotateCwIcon
                  className={cn("size-3.5", isFetching && "animate-spin")}
                />
                Retry
              </button>
            </div>
          ) : nothingAtAll ? (
            <div className="text-ink-3 flex items-center gap-2 py-1 text-sm">
              <PaperclipIcon className="size-4 shrink-0" />
              <span>
                No attachments yet.
                {canAttach && " Add a file with the + above."}
              </span>
            </div>
          ) : emptyTab ? (
            <div className="text-ink-3 flex flex-wrap items-center gap-2 py-1 text-sm">
              <PaperclipIcon className="size-4 shrink-0" />

              <span>
                {filter === "all"
                  ? "No attachments yet."
                  : EMPTY_FILTER_LABELS[filter]}
              </span>

              <button
                type="button"
                onClick={() => setFilter("all")}
                className="text-brand hover:bg-brand-soft rounded-control px-1.5 py-0.5 text-xs font-medium transition-colors"
              >
                Show all {count}
              </button>
            </div>
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
              aria-label="Attachments"
              className="border-hairline rounded-card overflow-hidden border"
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
              aria-label="Uploading"
              className="border-hairline rounded-card mt-2 overflow-hidden border"
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
  return (
    <div
      role="tablist"
      aria-label="Filter attachments by type"
      className="border-hairline rounded-control flex min-w-0 shrink items-center gap-0.5 overflow-x-auto border p-0.5"
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
              "focus-visible:ring-brand rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
              active
                ? "bg-brand-soft text-brand"
                : empty
                  ? "text-ink-3/60 hover:text-ink-3"
                  : "text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
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
  const { open, mounted, close, triggerProps, panelProps } = useCardPopover();

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        aria-label="Attachment actions"
        aria-expanded={open}
        title="More actions"
        className={cn(
          "focus-visible:ring-brand grid size-7 shrink-0 place-items-center rounded transition-colors outline-none focus-visible:ring-2",
          open
            ? "bg-brand-soft text-brand ring-brand/40 ring-1"
            : "text-ink-3 hover:bg-ink/10 hover:text-ink",
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Attachment actions"
            className="border-hairline bg-elevated rounded-card shadow-e2 z-[70] w-56 border p-1"
          >
            <MenuItem
              icon={view === "list" ? LayoutGridIcon : ListIcon}
              label={
                view === "list" ? "Switch to grid view" : "Switch to list view"
              }
              onClick={() => {
                onToggleView();
                close();
              }}
            />

            <div className="bg-hairline my-1 h-px" />

            <MenuItem
              icon={DownloadIcon}
              label="Download all"
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
                label="Delete all"
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
  return (
    <div
      className="border-status-red/30 bg-status-red/[0.04] rounded-card mb-2 flex flex-wrap items-center gap-2 border px-3 py-2.5 text-xs"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;

        event.preventDefault();
        onCancel();
      }}
    >
      <CircleAlertIcon className="text-status-red size-4 shrink-0" />

      <span className="text-ink-2 min-w-0 flex-1">
        Delete {count} {count === 1 ? "attachment" : "attachments"}? The files
        are removed from storage and cannot be restored.
      </span>

      <button
        type="button"
        autoFocus
        onClick={onConfirm}
        disabled={busy}
        className="text-status-red shrink-0 font-medium disabled:opacity-45"
      >
        {busy ? "Deleting…" : "Delete all"}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="text-ink-3 hover:text-ink shrink-0 font-medium"
      >
        Cancel
      </button>
    </div>
  );
}

function messageOf(
  error: unknown,
  fallback = "Upload failed. Please try again.",
) {
  if (error instanceof Error && error.message) return error.message;

  return fallback;
}

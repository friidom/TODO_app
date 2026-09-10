import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DownloadIcon,
  Loader2,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
  type LucideIcon,
} from "lucide-react";

import { useAttachmentUrl } from "@/services/attachments/useAttachmentUrl";
import {
  fileKind,
  formatBytes,
  previewKind,
  type PreviewKind,
} from "@/services/attachments/fileMeta";
import type { Attachment } from "@/types/data";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

import { KIND_ICONS } from "./attachmentIcons";

// Portalled to document.body at z-[60] — the task modal's panel is overflow-hidden and z-50, so a child couldn't outrank it in place.
// previewKind decides whether a file gets a renderable URL at all; this only renders what it's given.
export default function AttachmentPreview({
  attachment,
  url,
  urlPending,
  onClose,
}: {
  attachment: Attachment;
  url: string | undefined;
  urlPending: boolean;
  onClose: () => void;
}) {
  const kind = previewKind(attachment.mime_type);

  const panel = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);

  // Capture phase, not bubble — the task modal's listener was registered first, so a bubble-phase mark would fire too late.
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;

      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", handleEscape, true);

    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [onClose]);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  // No zoomed reset on file change — caller keys this by attachment id, so a new file remounts.

  function closeOnBackdrop(event: React.MouseEvent) {
    if (event.target === event.currentTarget) onClose();
  }

  return createPortal(
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${attachment.filename}`}
      onMouseDown={closeOnBackdrop}
      className={cn(
        "fixed inset-0 z-[60] flex flex-col outline-none",
        // Dark in both themes — a lightbox is the absence of a surface, not one of its own.
        "bg-black/85 backdrop-blur-sm",
        "animate-in fade-in-0 duration-150",
      )}
    >
      <Header
        attachment={attachment}
        kind={kind}
        zoomed={zoomed}
        onToggleZoom={() => setZoomed((on) => !on)}
        onClose={onClose}
      />

      <div
        onMouseDown={closeOnBackdrop}
        className={cn(
          "flex min-h-0 flex-1 p-3 sm:p-6",
          // m-auto on the child (not items-center here) so a zoomed image stays scrollable instead of clipping at the start edge.
          zoomed && kind === "image" && "overflow-auto",
        )}
      >
        {urlPending && kind !== "none" ? (
          <Loader2 className="m-auto size-6 animate-spin text-white/70" />
        ) : kind === "image" && url ? (
          <img
            src={url}
            alt={attachment.filename}
            onClick={() => setZoomed((on) => !on)}
            className={cn(
              "rounded-card shadow-e3 m-auto bg-black/20",
              zoomed
                ? "max-w-none cursor-zoom-out"
                : "max-h-full max-w-full cursor-zoom-in object-contain",
            )}
          />
        ) : kind === "pdf" && url ? (
          // self-stretch, not just h-full — an iframe's 150px default height needs the cross-axis stretch to fill.
          <iframe
            src={url}
            title={attachment.filename}
            className="rounded-card shadow-e3 h-full w-full self-stretch border-0 bg-white"
          />
        ) : (
          <Fallback attachment={attachment} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function Header({
  attachment,
  kind,
  zoomed,
  onToggleZoom,
  onClose,
}: {
  attachment: Attachment;
  kind: PreviewKind;
  zoomed: boolean;
  onToggleZoom: () => void;
  onClose: () => void;
}) {
  const download = useAttachmentUrl();
  const age = relativeTime(attachment.created_at, undefined, { short: true });

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p
          title={attachment.filename}
          className="truncate text-sm font-medium text-white"
        >
          {attachment.filename}
        </p>

        <p className="text-mini text-white/55 tabular-nums">
          {formatBytes(attachment.size_bytes)}
          {age && ` · ${age}`}
        </p>
      </div>

      {kind === "image" && (
        <PreviewAction
          icon={zoomed ? ZoomOutIcon : ZoomInIcon}
          label={zoomed ? "Fit to screen" : "Actual size"}
          onClick={onToggleZoom}
        />
      )}

      <PreviewAction
        icon={DownloadIcon}
        label="Download"
        busy={download.isPending}
        onClick={() => {
          download.mutate(
            {
              storagePath: attachment.storage_path,
              filename: attachment.filename,
            },
            {
              onSuccess: (href) => {
                window.location.href = href;
              },
            },
          );
        }}
      />

      <PreviewAction icon={XIcon} label="Close preview" onClick={onClose} />
    </header>
  );
}

// White-on-scrim, not the app's ink tokens — text-ink-3 on bg-black/85 is unreadable.
function PreviewAction({
  icon: Icon,
  label,
  busy,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className="focus-visible:ring-brand grid size-8 shrink-0 place-items-center rounded-full text-white/75 transition-colors outline-none hover:bg-white/15 hover:text-white focus-visible:ring-2 disabled:opacity-45"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Icon className="size-4" />
      )}
    </button>
  );
}

function Fallback({ attachment }: { attachment: Attachment }) {
  const download = useAttachmentUrl();
  const Icon = KIND_ICONS[fileKind(attachment.mime_type, attachment.filename)];

  return (
    <div className="border-hairline bg-surface rounded-surface shadow-e3 m-auto w-full max-w-sm border p-6 text-center">
      <span className="bg-ink/[0.06] text-ink-3 mx-auto mb-3 grid size-12 place-items-center rounded-full">
        <Icon className="size-5" />
      </span>

      <p
        title={attachment.filename}
        className="text-ink truncate text-sm font-medium"
      >
        {attachment.filename}
      </p>

      <p className="text-ink-3 text-mini mt-1 truncate">
        {attachment.mime_type} · {formatBytes(attachment.size_bytes)}
      </p>

      <p className="text-ink-3 mt-4 text-xs">
        This file type can&rsquo;t be previewed here.
      </p>

      <button
        type="button"
        disabled={download.isPending}
        onClick={() => {
          download.mutate(
            {
              storagePath: attachment.storage_path,
              filename: attachment.filename,
            },
            {
              onSuccess: (href) => {
                window.location.href = href;
              },
            },
          );
        }}
        className="bg-brand rounded-control mt-4 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-45"
      >
        {download.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <DownloadIcon className="size-3.5" />
        )}
        {download.isPending ? "Preparing…" : "Download"}
      </button>
    </div>
  );
}

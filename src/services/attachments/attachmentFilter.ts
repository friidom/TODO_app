import { fileExtension, fileKind } from "./fileMeta";
import type { Attachment } from "@/types/data";

// Client-side filtering over one work item's already-fetched attachments — no server round trip per tab.
export const ATTACHMENT_FILTERS = [
  "all",
  "images",
  "documents",
  "videos",
  "other",
] as const;

export type AttachmentFilter = (typeof ATTACHMENT_FILTERS)[number];

export type AttachmentCategory = Exclude<AttachmentFilter, "all">;

export const FILTER_LABELS: Record<AttachmentFilter, string> = {
  all: "All",
  images: "Images",
  documents: "Documents",
  videos: "Videos",
  other: "Other",
};

export const EMPTY_FILTER_LABELS: Record<AttachmentCategory, string> = {
  images: "No images attached.",
  documents: "No documents attached.",
  videos: "No videos attached.",
  other: "No other files attached.",
};

// Listed, not pattern-matched on "application/vnd." — that prefix also covers fonts and archives.
const DOCUMENT_MIMES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
  "application/epub+zip",
]);

// Fallback by extension for the common case where the browser reports application/octet-stream.
const DOCUMENT_EXTENSIONS = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "rtf",
  "odt",
  "ods",
  "odp",
  "pages",
  "numbers",
  "key",
  "epub",
]);

// Built on fileKind so the icon and the tab can never disagree. "other" is the default, not a failure.
export function attachmentCategory(
  mimeType: string,
  filename: string,
): AttachmentCategory {
  const kind = fileKind(mimeType, filename);

  if (kind === "image") return "images";
  if (kind === "video") return "videos";
  if (kind === "pdf" || kind === "text") return "documents";

  if (
    DOCUMENT_MIMES.has(mimeType.toLowerCase()) ||
    DOCUMENT_EXTENSIONS.has(fileExtension(filename))
  ) {
    return "documents";
  }

  return "other";
}

export function matchesFilter(
  attachment: Pick<Attachment, "mime_type" | "filename">,
  filter: AttachmentFilter,
): boolean {
  if (filter === "all") return true;

  return (
    attachmentCategory(attachment.mime_type, attachment.filename) === filter
  );
}

// One pass rather than five filter() calls.
export function filterCounts(
  attachments: readonly Pick<Attachment, "mime_type" | "filename">[],
): Record<AttachmentFilter, number> {
  const counts: Record<AttachmentFilter, number> = {
    all: attachments.length,
    images: 0,
    documents: 0,
    videos: 0,
    other: 0,
  };

  for (const attachment of attachments) {
    counts[attachmentCategory(attachment.mime_type, attachment.filename)] += 1;
  }

  return counts;
}

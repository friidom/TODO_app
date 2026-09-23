// Pure functions of a file's name/size — no React, no network. previewKind is a
// security boundary; read it before changing.

// UX only, and it must not exceed multer's limit in
// backend/src/modules/attachments/attachments.upload.ts — the server is the
// enforcement, this is just a faster "no".
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const FALLBACK_MIME = "application/octet-stream";

// Strict on purpose: refuses tar.gz's second dot, dotfiles, and anything not [a-z0-9]{1,8}.
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");

  if (dot < 1 || dot === filename.length - 1) return "";

  const ext = filename.slice(dot + 1).toLowerCase();

  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

const HEADER_UNSAFE = '"\\/';

// The name an <a download> is given. Spaces survive; only control chars,
// quotes and slashes are stripped.
export function downloadName(filename: string): string {
  const cleaned = Array.from(filename)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;

      return code > 31 && code !== 127 && !HEADER_UNSAFE.includes(char);
    })
    .join("")
    .trim();

  return cleaned || "download";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1000) return `${Math.round(bytes)} B`;

  const units = ["KB", "MB", "GB", "TB"];

  let value = bytes / 1000;
  let unit = 0;

  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }

  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export type FileKind =
  "image" | "video" | "audio" | "pdf" | "archive" | "text" | "file";

const EXTENSION_KINDS: Record<string, FileKind> = {
  zip: "archive",
  gz: "archive",
  tar: "archive",
  rar: "archive",
  "7z": "archive",
  pdf: "pdf",
  md: "text",
  txt: "text",
  csv: "text",
  json: "text",
  log: "text",
};

const ARCHIVE_MIMES = [
  "application/zip",
  "application/gzip",
  "application/x-tar",
  "application/x-7z-compressed",
  "application/vnd.rar",
];

// Security gate: only these two families ever get a renderable (non-download) URL — everything else stays a forced download.
// image: an <img> is a script-free context, even for SVG. pdf: an <iframe> isn't, but Content-Type is pinned to application/pdf at upload, so HTML served here won't execute.
export type PreviewKind = "image" | "pdf" | "none";

export function previewKind(mimeType: string): PreviewKind {
  const mime = mimeType.toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";

  return "none";
}

export function fileKind(mimeType: string, filename: string): FileKind {
  const mime = mimeType.toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/")) return "text";
  if (ARCHIVE_MIMES.includes(mime)) return "archive";

  return EXTENSION_KINDS[fileExtension(filename)] ?? "file";
}

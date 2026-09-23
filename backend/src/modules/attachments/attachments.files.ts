// Mirrors src/services/attachments/fileMeta.ts on the frontend. storageKey and
// canRenderInline are security boundaries; read them before changing.

export const FALLBACK_MIME = "application/octet-stream";

// Strict on purpose: refuses tar.gz's second dot, dotfiles, and anything not
// [a-z0-9]{1,8} — a loose extension is a path-injection surface in storageKey.
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");

  if (dot < 1 || dot === filename.length - 1) return "";

  const ext = filename.slice(dot + 1).toLowerCase();

  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

// The uploader's filename never reaches the key: it is read back as
// <board>/<todo>/<attachment>, so a `/` in it would let an uploader file an
// object under a board they cannot see.
export function storageKey(
  boardId: string,
  todoId: string,
  attachmentId: string,
  filename: string,
): string {
  const ext = fileExtension(filename);

  return `${boardId}/${todoId}/${attachmentId}${ext ? `.${ext}` : ""}`;
}

const MAX_FILENAME_LENGTH = 255;

// filename is a text column with no length limit and multer's originalname is
// whatever the client sent, NUL bytes included — which PostgreSQL refuses.
export function safeFilename(filename: string): string {
  const cleaned = Array.from(filename)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;

      return code > 31 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);

  return cleaned || "file";
}

// The gate on serving anything without Content-Disposition: attachment. Images
// render in an <img>, a script-free context; a PDF renders in an <iframe>,
// which is not, so it rides on Content-Type being pinned to the stored mime.
// Everything else stays a forced download whatever the client asks for.
export function canRenderInline(mimeType: string): boolean {
  const mime = mimeType.toLowerCase();

  return mime.startsWith("image/") || mime === "application/pdf";
}

const HEADER_UNSAFE = '"\\/';

function asciiFilename(filename: string): string {
  const cleaned = Array.from(filename)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;

      if (code < 32 || code === 127 || HEADER_UNSAFE.includes(char)) return "";

      return code > 126 ? "_" : char;
    })
    .join("")
    .trim();

  return cleaned || "download";
}

// RFC 5987 reserves ( ) ' * inside an ext-value, and encodeURIComponent leaves
// all four alone.
function extValue(filename: string): string {
  return encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function contentDisposition(
  kind: "inline" | "attachment",
  filename: string,
): string {
  return `${kind}; filename="${asciiFilename(filename)}"; filename*=UTF-8''${extValue(filename)}`;
}

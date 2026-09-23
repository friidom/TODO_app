import { env } from "../../config/env.js";

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// The same three the file input offers (ProfilePage.tsx). SVG is excluded on
// purpose and must stay excluded: it is a document that can carry script, and
// avatars are served from this API's own origin.
const ALLOWED = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type AvatarMime = keyof typeof ALLOWED;

// multer's file.mimetype is just the Content-Type the CLIENT typed, so it is
// worth no more than the filename. These are the real bytes: a file claiming
// image/png and containing HTML fails here rather than being stored and later
// served from our origin.
export function sniffAvatarMime(buffer: Buffer): AvatarMime | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function avatarExtension(mime: AvatarMime): string {
  return ALLOWED[mime];
}

// Both segments are server-minted uuids, so the key cannot contain a slash, a
// dot-dot or anything else the caller chose — the client never names an object.
// The userId prefix is what makes "delete only your own object" checkable from
// the key alone.
export function avatarStorageKey(userId: string, avatarId: string, mime: AvatarMime): string {
  return `${userId}/${avatarId}.${avatarExtension(mime)}`;
}

const OBJECT_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;

// Read back off a URL, so it is validated rather than trusted: without this a
// crafted ..%2f object would address another prefix in the bucket.
export function isAvatarObjectName(object: string): boolean {
  return OBJECT_PATTERN.test(object);
}

// An absolute URL, because profiles.avatar_url is rendered by a plain <img>
// in a dozen components and an <img> cannot carry an Authorization header.
// API_PUBLIC_URL is already the browser-reachable base in every environment
// (:3000 under Docker, :4000 for a host backend), which is what keeps the two
// setups working without a per-environment column.
export function avatarUrl(userId: string, avatarId: string, mime: AvatarMime): string {
  const base = env.API_PUBLIC_URL.replace(/\/+$/, "");

  return `${base}/users/${userId}/avatar/${avatarId}.${avatarExtension(mime)}`;
}

// The inverse, used to delete the object a stored URL points at. Returns null
// for anything this server did not write — a leftover Supabase URL, most
// importantly, which must be dropped from the profile without attempting a
// MinIO delete that would fail.
export function avatarKeyFromUrl(url: string | null): string | null {
  if (url === null) return null;

  const match = /\/users\/([0-9a-f-]{36})\/avatar\/([0-9a-f-]{36}\.(?:png|jpg|webp))$/.exec(url);

  if (match === null) return null;

  return `${match[1]}/${match[2]}`;
}

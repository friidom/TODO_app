import { supabase } from "../api/supabase";

// Table calls and storage calls in one file — the row exists to describe the object, so they're one concern.

const ATTACHMENT_FIELDS =
  "id, board_id, todo_id, uploader_id, filename, storage_path, size_bytes, mime_type, created_at";

const BUCKET = "task-attachments";

// Minted per click, consumed immediately — this is a ceiling, not a live window.
const SIGNED_URL_TTL_SECONDS = 60;

export async function fetchAttachments(todoId: string) {
  const { data, error } = await supabase
    .from("attachments")
    .select(ATTACHMENT_FIELDS)
    .eq("todo_id", todoId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data;
}

// Object uploaded before this is called — a row with no bytes is visible and retryable; bytes with no row are invisible orphans.
export async function insertAttachment(row: {
  id: string;
  board_id: string;
  todo_id: string;
  uploader_id: string;
  filename: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
}) {
  const { data, error } = await supabase
    .from("attachments")
    .insert(row)
    .select(ATTACHMENT_FIELDS)
    .single();

  if (error) throw error;

  return data;
}

export async function deleteAttachmentRow(id: string) {
  const { error } = await supabase.from("attachments").delete().eq("id", id);

  if (error) throw error;

  return id;
}

// No upsert — attachments are append-only, keyed by a fresh uuid, so a collision means something is wrong.
export async function uploadObject(path: string, file: File, mime: string) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: mime });

  if (error) throw error;
}

// Called on both failure paths (insert failed post-upload, and ordinary delete) to avoid a row-less orphan object.
export async function removeObject(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) throw error;
}

// download forces Content-Disposition: attachment — the bucket has no mime allow-list, so this stops an uploaded .html executing inline.
export async function signedUrl(path: string, downloadAs: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: downloadAs });

  if (error) throw error;

  return data.signedUrl;
}

// Longer than the download TTL — a preview URL sits in an <img> for as long as the panel stays open.
const PREVIEW_URL_TTL_SECONDS = 3600;

// The one call that omits `download` — that's what lets the URL be an <img>/<iframe> source. Don't call with a previewKind "none" path.
export async function signedPreviewUrls(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, PREVIEW_URL_TTL_SECONDS);

  if (error) throw error;

  return Object.fromEntries(
    data.flatMap((row) =>
      row.path && row.signedUrl ? [[row.path, row.signedUrl]] : [],
    ),
  );
}

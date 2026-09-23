import { api, requestBlob, toQuery } from "../api/client";
import { downloadName } from "./fileMeta";
import type { Attachment } from "@/types/data";

export function fetchAttachments(todoId: string): Promise<Attachment[]> {
  return api.get<Attachment[]>(`/todos/${todoId}/attachments`);
}

// Only the bytes and the name travel: board_id, uploader_id and the object key
// are all the server's, so nothing the client sends decides where a file lands.
export function uploadAttachment(todoId: string, file: File): Promise<Attachment> {
  const form = new FormData();

  form.append("file", file);

  return api.post<Attachment>(`/todos/${todoId}/attachments`, form);
}

export async function deleteAttachment(todoId: string, id: string): Promise<string> {
  await api.del<void>(`/todos/${todoId}/attachments/${id}`);

  return id;
}

function contentPath(
  todoId: string,
  id: string,
  disposition: "inline" | "attachment",
): string {
  return `/todos/${todoId}/attachments/${id}/content${toQuery({ disposition })}`;
}

// The server decides whether "inline" is honoured — only images and PDFs get
// their own Content-Type, everything else comes back as a forced download.
// The caller owns revoking the URL.
export async function attachmentObjectUrl(todoId: string, id: string): Promise<string> {
  return URL.createObjectURL(await requestBlob(contentPath(todoId, id, "inline")));
}

// Long enough for the browser to have taken the blob; revoking synchronously
// after click() cancels the download in Chrome.
const REVOKE_DELAY_MS = 30_000;

// Fetch-then-anchor rather than a link to the endpoint: the access token lives
// in a module variable, so a plain navigation would arrive unauthenticated.
export async function downloadAttachment(
  todoId: string,
  id: string,
  filename: string,
): Promise<void> {
  const url = URL.createObjectURL(
    await requestBlob(contentPath(todoId, id, "attachment")),
  );

  // A detached anchor, not location.href — several downloads in a loop would
  // cancel each other through a navigation.
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = downloadName(filename);
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

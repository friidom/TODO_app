// blank collapses to null, not "" — one value every caller tests once
export function commentValue(draft: string): string | null {
  const trimmed = draft.trim();

  return trimmed === "" ? null : trimmed;
}

// blanking an edit reverts rather than clearing — content is NOT NULL and checked non-blank, deleting is a separate control
export function editedValue(draft: string, stored: string): string | null {
  const trimmed = draft.trim();

  if (trimmed === "" || trimmed === stored) return null;

  return trimmed;
}

// both columns default to now() on insert, so they're exactly equal until a real UPDATE touches updated_at
export function isEdited(comment: {
  created_at: string;
  updated_at: string;
}): boolean {
  return comment.updated_at !== comment.created_at;
}

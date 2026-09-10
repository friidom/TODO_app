// what an edited field in the detail panel should store, and whether it changed at all — pure, no React/network

// whitespace-only clears rather than storing spaces, so "no description" is one value, not a mess of blank strings
export function descriptionValue(draft: string): string | null {
  return draft.trim() === "" ? null : draft;
}

export function descriptionChanged(
  draft: string,
  stored: string | null,
): boolean {
  return descriptionValue(draft) !== (stored ?? null);
}

// unlike a description, an empty title reverts instead of clearing — it's the card's only label
export function titleValue(
  draft: string,
  stored: string | null,
): string | null {
  const trimmed = draft.trim();

  if (trimmed === "" || trimmed === (stored ?? "")) return null;

  return trimmed;
}

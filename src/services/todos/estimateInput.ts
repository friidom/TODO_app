export function formatEstimate(value: number | null): string {
  return value === null ? "–" : String(value);
}

// forced lets a caller with no row to hover (the Details rail) force the trigger visible anyway.
export function estimateAlwaysVisible(
  value: number | null,
  forced = false,
): boolean {
  return forced || value !== null;
}

export function estimateToDraft(value: number | null): string {
  return value === null ? "" : String(value);
}

// undefined = invalid draft, keep editing. Empty resolves to null (not Number("") === 0) so clearing the field means "no estimate", not zero.
export function parseEstimateDraft(draft: string): number | null | undefined {
  const trimmed = draft.trim();

  if (trimmed === "") return null;

  const value = Number(trimmed);

  if (!Number.isFinite(value) || value < 0) return undefined;

  return value;
}

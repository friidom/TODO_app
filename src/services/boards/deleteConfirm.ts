// Mistake-guard, not a permission — the DELETE policy already refuses a non-owner regardless.

// title is nullable, so the target to type is whatever's actually on screen ("Untitled board" for a null one).
export function confirmLabel(title: string | null): string {
  return title?.trim() || "Untitled board";
}

// Trimmed but case-sensitive — trailing whitespace is a paste artefact, case proves they read the name.
export function confirmMatches(typed: string, title: string | null): boolean {
  return typed.trim() === confirmLabel(title);
}

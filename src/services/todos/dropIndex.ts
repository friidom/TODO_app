import type { Todo } from "@/types/data";

// Translates a gap index (counted over the rendered/filtered list) into a splice index over the full column minus the dragged card.
// Can't just reuse the rendered gap index — a filtered or swimlaned view numbers gaps over a different array than the one splice() sees.
export function resolveDropIndex(
  full: Todo[],
  visible: Todo[],
  gap: number,
  activeId: string,
): number {
  const anchorId = visible[gap]?.id ?? null;

  const rest = full.filter((todo) => todo.id !== activeId);

  // -1 covers "no anchor" and "anchor is the dragged card itself" — both append.
  const at = anchorId ? rest.findIndex((todo) => todo.id === anchorId) : -1;

  return at === -1 ? rest.length : at;
}

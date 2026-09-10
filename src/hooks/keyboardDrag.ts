// Which gap an arrow key moves a keyboard drag to. Pure — no React, no dnd-kit, no DOM.
// Index-based, not pixel-based: a keyboard drag selects the next gap rather than traveling a distance, so it always lands somewhere droppable.

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

const ARROW_KEYS: readonly string[] = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];

export function isArrowKey(key: string): key is ArrowKey {
  return ARROW_KEYS.includes(key);
}

export interface GapRef {
  id: string;
  columnId: string | null;
  index: number;
  beforeId?: string | null;
  afterId?: string | null;
}

// A gap touching the dragged item is where it already is — an arrow press steps over it instead of stopping there.
function touchesActive(gap: GapRef, activeId: string): boolean {
  return gap.beforeId === activeId || gap.afterId === activeId;
}

function inColumn(gaps: GapRef[], columnId: string | null): GapRef[] {
  return gaps
    .filter((gap) => gap.columnId === columnId)
    .sort((a, b) => a.index - b.index);
}

// stops at the edges rather than wrapping — wrapping in a list this short is disorienting with no visual cue
function stepFrom(
  gaps: GapRef[],
  fromIndex: number,
  step: number,
  activeId: string,
): GapRef | null {
  for (let i = fromIndex + step; i >= 0 && i < gaps.length; i += step) {
    if (!touchesActive(gaps[i], activeId)) return gaps[i];
  }

  return null;
}

function nearestUsable(
  gaps: GapRef[],
  wanted: number,
  activeId: string,
): GapRef | null {
  const at = gaps[wanted];

  if (at && !touchesActive(at, activeId)) return at;

  return (
    stepFrom(gaps, wanted, 1, activeId) ?? stepFrom(gaps, wanted, -1, activeId)
  );
}

// up/down moves within the column; left/right moves to the neighbouring column at the same depth
export function nextTodoGap(
  gaps: GapRef[],
  columnIds: string[],
  current: { columnId: string | null; index: number },
  key: ArrowKey,
  activeId: string,
): GapRef | null {
  if (key === "ArrowUp" || key === "ArrowDown") {
    return stepFrom(
      inColumn(gaps, current.columnId),
      current.index,
      key === "ArrowUp" ? -1 : 1,
      activeId,
    );
  }

  const at = columnIds.indexOf(current.columnId ?? "");

  if (at === -1) return null;

  const target = columnIds[at + (key === "ArrowLeft" ? -1 : 1)];

  if (!target) return null;

  const column = inColumn(gaps, target);

  if (!column.length) return null;

  return nearestUsable(
    column,
    Math.min(current.index, column.length - 1),
    activeId,
  );
}

export function nextColumnGap(
  gaps: GapRef[],
  currentIndex: number,
  key: ArrowKey,
  activeId: string,
): GapRef | null {
  if (key === "ArrowUp" || key === "ArrowDown") return null;

  return stepFrom(
    [...gaps].sort((a, b) => a.index - b.index),
    currentIndex,
    key === "ArrowLeft" ? -1 : 1,
    activeId,
  );
}

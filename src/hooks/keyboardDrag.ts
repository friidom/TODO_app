/**
 * Which gap an arrow key moves a keyboard drag to (M9-01). Pure — no React, no
 * dnd-kit, no DOM.
 *
 * **The board's collision detection is pointer-first and cannot be reused for
 * this.** `useKanbanDnd`'s `collisionDetection` resolves a drop by measuring
 * distance from the cursor to each gap's centre, and a keyboard has no cursor.
 * The plan called that out as the whole of this task's difficulty: *"the custom
 * collisionDetection reads pointerCoordinates as the first thing it does, so a
 * KeyboardSensor needs a parallel index-based resolution path alongside the
 * pointer path."* This module is that path.
 *
 * **Index-based rather than pixel-based, and that is the point.** A keyboard
 * drag does not travel — it *selects*. Moving by a fixed number of pixels per
 * press would depend on how tall the cards happen to be and would need a dozen
 * presses to cross a column; moving by one gap per press always lands somewhere
 * droppable, whatever the board looks like. The hook turns the gap this returns
 * back into coordinates, so the pointer path stays the only thing that measures
 * anything.
 *
 * Pure so the movement rules can be tested without a socket, a DOM or a drag.
 */

/** The four keys this understands. Everything else is left to the browser. */
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

/**
 * One drop target, reduced to what a keyboard needs to know about it.
 *
 * Deliberately not a `DroppableContainer`: the rects those carry are the
 * pointer path's business, and taking them here would make this module need a
 * laid-out DOM to be tested.
 */
export interface GapRef {
  id: string;
  /** The column this gap sits in. Null for a gap *between* columns. */
  columnId: string | null;
  index: number;
  /** The two neighbours the gap sits between, as the droppables record them. */
  beforeId?: string | null;
  afterId?: string | null;
}

/**
 * A gap touching the dragged item is where it already is.
 *
 * The pointer path refuses these too (`touchesActive` in `useKanbanDnd`) — it
 * would otherwise draw a drop line around the item being dragged. Here it means
 * something slightly different and more useful: an arrow press *steps over*
 * such a gap rather than stopping on it, so one press always produces a visible
 * move instead of sometimes producing nothing.
 */
function touchesActive(gap: GapRef, activeId: string): boolean {
  return gap.beforeId === activeId || gap.afterId === activeId;
}

/** Gaps of one column, densely indexed, in order. */
function inColumn(gaps: GapRef[], columnId: string | null): GapRef[] {
  return gaps
    .filter((gap) => gap.columnId === columnId)
    .sort((a, b) => a.index - b.index);
}

/**
 * Walk from `fromIndex` in `step` direction until a gap the active item is not
 * already sitting against turns up. Null at the end of the column — a keyboard
 * drag stops at the edges rather than wrapping, because wrapping in a list this
 * short is disorienting and there is no visual cue that it happened.
 */
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

/** The gap nearest `wanted`, preferring it, then downward, then upward. */
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

/**
 * Where an arrow key takes a card being dragged.
 *
 * Up and down move within the column; left and right move to the neighbouring
 * column **at the same depth**, clamped to what that column has. Keeping the
 * depth is what makes a sideways press feel like moving the card across rather
 * than dropping it at the top of somewhere else.
 *
 * `columnIds` is the board's columns in the order they are on screen, which the
 * hook derives from the rects — this module never measures anything.
 */
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

/**
 * Where an arrow key takes a column being dragged.
 *
 * Left and right only. Up and down do nothing rather than something arbitrary:
 * columns are a horizontal list, and a vertical key with no vertical meaning
 * should leave the drag where it is.
 */
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

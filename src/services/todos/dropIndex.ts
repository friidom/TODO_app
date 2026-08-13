import type { ISupabaseTodo } from "@/types/data";

/**
 * The index `applyTodoMoved` needs, derived from the card the drop gap sits above.
 *
 * **Why a translation is needed at all.** `DropZone` numbers its gaps over the
 * list it *renders*, counting the dragged card. `applyTodoMoved` splices into the
 * destination column *after* removing that card, over every row the column holds.
 * Those two lists agreed only while the board rendered every card in stored
 * order — which stopped being true the moment the view could filter, sort or
 * split into swimlanes.
 *
 * They did not entirely agree even then. In a three-card column `[A, B, C]`,
 * dragging `A` to the gap between `B` and `C` sent `index: 2`; with `A` removed
 * the destination is `[B, C]`, so `splice(2)` appended and the card landed at the
 * bottom instead of the middle. The last gap only ever worked because
 * `Array.prototype.splice` clamps an index past the end. `cache.test.ts` states
 * the post-removal contract — *"the last gap, whose index is the length without
 * the card"* — and the caller simply never honoured it.
 *
 * **The fix is to stop counting and start naming.** A gap is identified by the
 * card below it, and a card's identity survives any amount of filtering,
 * reordering or lane-splitting. There is nothing left to keep in step.
 */
export function resolveDropIndex(
  /** Every row of the destination column, in stored order. */
  full: ISupabaseTodo[],
  /** What was actually rendered there — `full` filtered, or one lane's share of it. */
  visible: ISupabaseTodo[],
  /** The `DropZone`'s index, counted over `visible`. */
  gap: number,
  /** The card being dragged. `applyTodoMoved` removes it before splicing. */
  activeId: string,
): number {
  // The gap sits above this card. Past the last one there is no card to name,
  // which is the append case.
  const anchorId = visible[gap]?.id ?? null;

  const rest = full.filter((todo) => todo.id !== activeId);

  // -1 covers two cases, and appending is right for both: no anchor at all, and
  // an anchor that is the dragged card itself. The latter is unreachable from
  // the board — `touchesActive` in `useKanbanDnd` suppresses the gaps either
  // side of the dragged card — but a function that answers it is one that
  // cannot be broken by a change to that suppression.
  const at = anchorId ? rest.findIndex((todo) => todo.id === anchorId) : -1;

  return at === -1 ? rest.length : at;
}

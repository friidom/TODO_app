// The server sends the reduced roster, already deduped by user and sorted, so
// there is nothing left to derive here. What remains is the render guard: the
// server re-emits an identical roster whenever anyone reconnects, and without
// this every one of those repaints the whole board.
export function sameViewers(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  return a.every((id, index) => id === b[index]);
}

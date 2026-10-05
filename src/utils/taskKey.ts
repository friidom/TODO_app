// null while the card's insert is still in flight — board_key is assigned by a
// trigger — and while the board itself has not loaded, since the prefix is the
// server's to choose and any stand-in would label the card wrongly.
export function taskKey(
  prefix: string,
  boardKey: number | null,
): string | null {
  return boardKey === null || prefix === "" ? null : `${prefix}-${boardKey}`;
}

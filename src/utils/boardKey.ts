// A copy of backend/src/lib/boardKey.ts's validation, kept in step by
// board-key-fixture.json.

export const BOARD_KEY_MIN_LENGTH = 2;
export const BOARD_KEY_MAX_LENGTH = 10;

const BOARD_KEY_SHAPE = /^[A-Z][A-Z0-9]*$/;

export type BoardKeyError = "required" | "tooShort" | "tooLong" | "shape";

export function normalizeBoardKey(value: string): string {
  return value.trim().toUpperCase();
}

export function boardKeyError(value: string): BoardKeyError | undefined {
  const key = normalizeBoardKey(value);

  if (!key) return "required";
  if (!BOARD_KEY_SHAPE.test(key)) return "shape";
  if (key.length < BOARD_KEY_MIN_LENGTH) return "tooShort";
  if (key.length > BOARD_KEY_MAX_LENGTH) return "tooLong";

  return undefined;
}

export interface BoardKeyField {
  key: string;
  error: BoardKeyError | undefined;
  changed: boolean;
  warn: boolean;
}

// next_key rather than the cards on screen: a deleted card's key may already
// be written into a commit message, so the warning outlives the card.
export function boardKeyField(
  draft: string,
  board: { key_prefix: string; next_key: number },
): BoardKeyField {
  const key = normalizeBoardKey(draft);

  return {
    key,
    error: boardKeyError(draft),
    changed: key !== board.key_prefix,
    warn: board.next_key > 1,
  };
}

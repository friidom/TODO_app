// prefix stays in sync with the default in supabase/migrations/20260814100000_board_key_prefix.sql
export const DEFAULT_KEY_PREFIX = "KAN";

// null while the card's insert is still in flight — board_key is assigned by a trigger, so there's no key to show yet.
export function taskKey(
  prefix: string,
  boardKey: number | null,
): string | null {
  return boardKey === null ? null : `${prefix}-${boardKey}`;
}

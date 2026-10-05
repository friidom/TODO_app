// boards_key_prefix_format and board_keys_key_format are the guarantee; this
// file is validation plus the derivation and suffixing a CHECK cannot do.
// src/utils/boardKey.ts mirrors the validation half, held to the same cases by
// board-key-fixture.json.

export const BOARD_KEY_MIN_LENGTH = 2;
export const BOARD_KEY_MAX_LENGTH = 10;

const BOARD_KEY_SHAPE = /^[A-Z][A-Z0-9]*$/;
const SINGLE_WORD_LENGTH = 3;
const FALLBACK_BOARD_KEY = "BRD";

export type BoardKeyError = "required" | "tooShort" | "tooLong" | "shape";

export const BOARD_KEY_MESSAGES: Record<BoardKeyError, string> = {
  required: "Board key is required.",
  tooShort: `Board key must be at least ${BOARD_KEY_MIN_LENGTH} characters.`,
  tooLong: `Board key must be at most ${BOARD_KEY_MAX_LENGTH} characters.`,
  shape: "Board key must contain only letters and numbers and start with a letter.",
};

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

// Russian plus the four Uzbek Cyrillic letters — the scripts the UI ships in.
const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

// Apostrophes are dropped rather than split on, so Uzbek "Oʻzbek" and
// "Don't" stay one word instead of yielding a stray initial. Everything before
// the first letter goes because a key must start with one: "3D Printing" is DP.
function wordsOf(title: string): string[] {
  return [...title.toLowerCase()]
    .map((char) => CYRILLIC[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['`ʻʼ‘’]/g, "")
    .toUpperCase()
    .replace(/^[^A-Z]+/, "")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

export function boardKeyBase(title: string): string {
  const words = wordsOf(title);
  const initials = words.map((word) => word.charAt(0)).join("");

  if (words.length > 1 && initials.length >= BOARD_KEY_MIN_LENGTH) {
    return initials.slice(0, BOARD_KEY_MAX_LENGTH);
  }

  const joined = words.join("").slice(0, SINGLE_WORD_LENGTH);

  return joined.length >= BOARD_KEY_MIN_LENGTH ? joined : FALLBACK_BOARD_KEY;
}

export function suffixedBoardKey(base: string, suffix: number): string {
  const tail = String(suffix);

  return base.slice(0, BOARD_KEY_MAX_LENGTH - tail.length) + tail;
}

import { BOARD_KEY_MAX_LENGTH, boardKeyError } from "./boardKey";

// The client half of backend/src/lib/taskRef.ts. The server still decides what
// a key resolves to, and whether this caller may see it; this only decides
// which runs of text are offered as links.

const MAX_TASK_NUMBER = 2_147_483_647;

// Upper-case only, as written: "covid-19" and "utf-8" in a sentence are not
// references, and a lower-case key is not how anyone writes one.
const CANDIDATE = /\b([A-Z][A-Z0-9]*)-([1-9][0-9]*)\b/g;

export interface IssueTarget {
  boardId: string;
  todoId: string;
}

export type TextSegment =
  | { kind: "text"; text: string }
  | { kind: "ref"; text: string; prefix: string; number: number };

function isRef(prefix: string, number: number): boolean {
  return (
    prefix.length <= BOARD_KEY_MAX_LENGTH &&
    boardKeyError(prefix) === undefined &&
    number <= MAX_TASK_NUMBER
  );
}

// prefixes: when given, only keys of those boards — the ones this person can
// open — become links, so "ISO-8601" stays text unless a board is called ISO.
export function splitTaskRefs(
  text: string,
  prefixes?: ReadonlySet<string>,
): TextSegment[] {
  const segments: TextSegment[] = [];
  let at = 0;

  for (const match of text.matchAll(CANDIDATE)) {
    const [whole, prefix, digits] = match;
    const number = Number(digits);
    const index = match.index;

    if (!isRef(prefix, number) || (prefixes && !prefixes.has(prefix))) {
      continue;
    }

    if (index > at)
      segments.push({ kind: "text", text: text.slice(at, index) });

    segments.push({ kind: "ref", text: whole, prefix, number });
    at = index + whole.length;
  }

  if (at < text.length) segments.push({ kind: "text", text: text.slice(at) });

  return segments;
}

// A real href in every case, so middle-click and "open in new tab" work: the
// board overlay when the target is known, the resolving route when it is not.
export function issueHref(key: string, to?: IssueTarget | null): string {
  return to
    ? `/boards/${to.boardId}?task=${to.todoId}`
    : `/tasks/${encodeURIComponent(key)}`;
}

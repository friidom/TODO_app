import { boardKeyError } from "./boardKey.js";

const TASK_REF = /^([A-Za-z][A-Za-z0-9]*)-([1-9][0-9]*)$/;

// todos.board_key is int4: a larger number cannot name a card, and passing one
// to Prisma would throw rather than find nothing.
const MAX_TASK_NUMBER = 2_147_483_647;

export interface TaskRef {
  key: string;
  number: number;
}

export function parseTaskRef(raw: string): TaskRef | null {
  const match = TASK_REF.exec(raw);

  if (match === null) return null;

  const key = match[1]!.toUpperCase();
  const number = Number(match[2]);

  if (boardKeyError(key) !== undefined || number > MAX_TASK_NUMBER) return null;

  return { key, number };
}

export function formatTaskRef(key: string, number: number): string {
  return `${key}-${number}`;
}

// GitLab's own YouTrack issue pattern, so the references GitLab renders as
// links are the ones Veylo attaches. parseTaskRef still decides validity.
const TASK_REF_CANDIDATE = /\b[A-Za-z][A-Za-z0-9_]*-\d+\b/g;

const MAX_TASK_REFS = 50;

export interface TaskRefMatch extends TaskRef {
  text: string;
}

export function findTaskRefs(text: string, limit = MAX_TASK_REFS): TaskRefMatch[] {
  const found = new Map<string, TaskRefMatch>();

  for (const [candidate] of text.matchAll(TASK_REF_CANDIDATE)) {
    if (found.size >= limit) break;

    const ref = parseTaskRef(candidate);

    if (ref === null) continue;

    const id = formatTaskRef(ref.key, ref.number);

    if (!found.has(id)) found.set(id, { ...ref, text: candidate });
  }

  return [...found.values()];
}

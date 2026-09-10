import type { Todo } from "@/types/data";
import { toCalendarDay } from "@/utils/dueDate";
import { addDays, addMonths, startOfMonth, startOfWeek } from "./calendar";

// pure string math over YYYY-MM-DD, Date only used at the very edge for formatting — see calendar.ts

export const TIMELINE_SCALES = ["weeks", "months"] as const;

export type TimelineScale = (typeof TIMELINE_SCALES)[number];

export const TIMELINE_WINDOW: Record<
  TimelineScale,
  { ticks: number; span: number }
> = {
  weeks: { ticks: 42, span: 1 },
  months: { ticks: 26, span: 7 },
};

export interface TimelineItem {
  todo: Todo;
  start: string;
  end: string;
  // true when only one of start/end is set — nothing to span, just a marker
  isPoint: boolean;
}

export function timelineItems(todos: Todo[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const todo of todos) {
    const start = todo.start_date ? toCalendarDay(todo.start_date) : null;
    const end = todo.due_date ? toCalendarDay(todo.due_date) : null;

    if (start && end) {
      // db constraint should prevent start > end, but a pre-constraint row could still have it
      items.push(
        start <= end
          ? { todo, start, end, isPoint: false }
          : { todo, start: end, end: start, isPoint: false },
      );

      continue;
    }

    const only = start ?? end;

    if (!only) continue;

    items.push({ todo, start: only, end: only, isPoint: true });
  }

  return items.sort(compareItems);
}

function compareItems(a: TimelineItem, b: TimelineItem): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  if (a.end !== b.end) return a.end < b.end ? -1 : 1;

  // null board_key means still in flight — sort those last, not to the top
  const ak = a.todo.board_key ?? Number.MAX_SAFE_INTEGER;
  const bk = b.todo.board_key ?? Number.MAX_SAFE_INTEGER;

  if (ak !== bk) return ak - bk;

  return a.todo.id < b.todo.id ? -1 : a.todo.id > b.todo.id ? 1 : 0;
}

export function unscheduledTodos(todos: Todo[]): Todo[] {
  return todos.filter((todo) => !todo.start_date && !todo.due_date);
}

export function unscheduledCount(todos: Todo[]): number {
  return unscheduledTodos(todos).length;
}

export function timelineTicks(scale: TimelineScale, anchor: string): string[] {
  const { ticks, span } = TIMELINE_WINDOW[scale];

  const first =
    scale === "weeks" ? startOfWeek(anchor) : startOfWeek(startOfMonth(anchor));

  return Array.from({ length: ticks }, (_, i) => addDays(first, i * span));
}

export function windowEnd(ticks: string[], scale: TimelineScale): string {
  const last = ticks[ticks.length - 1];

  return addDays(last, TIMELINE_WINDOW[scale].span);
}

export function tickIndexOf(
  day: string,
  ticks: string[],
  scale: TimelineScale,
): number | null {
  if (ticks.length === 0) return null;
  if (day < ticks[0]) return null;
  if (day >= windowEnd(ticks, scale)) return null;

  for (let i = ticks.length - 1; i >= 0; i -= 1) {
    if (ticks[i] <= day) return i;
  }

  return null;
}

export function placeItem(
  item: Pick<TimelineItem, "start" | "end">,
  ticks: string[],
  scale: TimelineScale,
): {
  index: number;
  span: number;
  openStart: boolean;
  openEnd: boolean;
} | null {
  if (ticks.length === 0) return null;

  const first = ticks[0];
  const end = windowEnd(ticks, scale);

  if (item.end < first || item.start >= end) return null;

  const openStart = item.start < first;
  const openEnd = item.end >= end;

  const startIndex = openStart
    ? 0
    : (tickIndexOf(item.start, ticks, scale) ?? 0);
  const endIndex = openEnd
    ? ticks.length - 1
    : (tickIndexOf(item.end, ticks, scale) ?? ticks.length - 1);

  return {
    index: startIndex,
    span: Math.max(1, endIndex - startIndex + 1),
    openStart,
    openEnd,
  };
}

// generic over anything placeItem can place — sprint bands reuse this too, not just TimelineItem
export function placeItems<T extends Pick<TimelineItem, "start" | "end">>(
  items: T[],
  ticks: string[],
  scale: TimelineScale,
): { item: T; place: NonNullable<ReturnType<typeof placeItem>> }[] {
  const placed = [];

  for (const item of items) {
    const place = placeItem(item, ticks, scale);

    if (place) placed.push({ item, place });
  }

  return placed;
}

export function monthBands(
  ticks: string[],
): { key: string; index: number; span: number }[] {
  const bands: { key: string; index: number; span: number }[] = [];

  ticks.forEach((day, index) => {
    const key = day.slice(0, 7);
    const last = bands[bands.length - 1];

    if (last && last.key === key) last.span += 1;
    else bands.push({ key, index, span: 1 });
  });

  return bands;
}

export function bandAnchor(key: string): string {
  return `${key}-01`;
}

function utc(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, date));
}

export function windowLabel(
  ticks: string[],
  scale: TimelineScale,
  locale?: string,
): string {
  if (ticks.length === 0) return "";

  const first = ticks[0];
  const last = addDays(windowEnd(ticks, scale), -1);

  const sameMonth = first.slice(0, 7) === last.slice(0, 7);

  const startOptions: Intl.DateTimeFormatOptions = sameMonth
    ? { day: "numeric", timeZone: "UTC" }
    : { day: "numeric", month: "short", timeZone: "UTC" };

  return `${utc(first).toLocaleDateString(locale, startOptions)} – ${utc(
    last,
  ).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

export function tickLabel(day: string): string {
  return String(Number(day.slice(8, 10)));
}

export function stepAnchor(
  scale: TimelineScale,
  anchor: string,
  direction: -1 | 1,
): string {
  return scale === "weeks"
    ? addDays(anchor, direction * 7)
    : addMonths(anchor, direction);
}

export function isCurrentAnchor(
  scale: TimelineScale,
  anchor: string,
  today: string,
): boolean {
  return scale === "weeks"
    ? startOfWeek(anchor) === startOfWeek(today)
    : anchor.slice(0, 7) === today.slice(0, 7);
}

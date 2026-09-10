import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  EqualIcon,
  type LucideIcon,
} from "lucide-react";

// values are lowercase because the DB CHECK constraint spells them that way — todos.type capitalises its own, inconsistent but intentional.
// keep each class a full literal string — Tailwind scans source text, a composed text-${token} emits no CSS.
export const PRIORITIES = {
  highest: {
    icon: ChevronsUpIcon,
    label: "Highest",
    tone: "text-status-red",
    chip: "bg-status-red/15 text-status-red hover:bg-status-red/25",
  },
  high: {
    icon: ChevronUpIcon,
    label: "High",
    tone: "text-status-red",
    chip: "bg-status-red/15 text-status-red hover:bg-status-red/25",
  },
  medium: {
    icon: EqualIcon,
    label: "Medium",
    tone: "text-status-orange",
    chip: "bg-status-orange/15 text-status-orange hover:bg-status-orange/25",
  },
  low: {
    icon: ChevronDownIcon,
    label: "Low",
    tone: "text-status-blue",
    chip: "bg-status-blue/15 text-status-blue hover:bg-status-blue/25",
  },
  lowest: {
    icon: ChevronsDownIcon,
    label: "Lowest",
    tone: "text-status-blue",
    chip: "bg-status-blue/15 text-status-blue hover:bg-status-blue/25",
  },
} as const satisfies Record<
  string,
  { icon: LucideIcon; label: string; tone: string; chip: string }
>;

export type Priority = keyof typeof PRIORITIES;

// doubles as sort rank — PRIORITY_OPTIONS.indexOf(p) is the only place levels are ordered, so sorting can't disagree with the menu
export const PRIORITY_OPTIONS = [
  "highest",
  "high",
  "medium",
  "low",
  "lowest",
] as const;

// unset ranks last, not as "medium" — no priority isn't middling, it's unanswered
export function priorityRank(value?: string | null): number {
  const index = PRIORITY_OPTIONS.indexOf(value as Priority);

  return index === -1 ? PRIORITY_OPTIONS.length : index;
}

export function priorityOf(value?: string | null) {
  return value && value in PRIORITIES ? PRIORITIES[value as Priority] : null;
}

export function toPriority(value?: string | null): Priority | null {
  return value && value in PRIORITIES ? (value as Priority) : null;
}

import {
  BugIcon,
  LightbulbIcon,
  type LucideIcon,
  SquareCheckIcon,
  BookOpenIcon,
  ZapIcon,
} from "lucide-react";

// classes as whole literal strings, not composed — Tailwind scans source text, so a template string would emit no CSS

export const WORK_TYPES = {
  Bug: {
    icon: BugIcon,
    tone: "text-status-red",
    chip: "bg-status-red/15 text-status-red hover:bg-status-red/25",
  },
  Task: {
    icon: SquareCheckIcon,
    tone: "text-status-blue",
    chip: "bg-status-blue/15 text-status-blue hover:bg-status-blue/25",
  },
  Story: {
    icon: BookOpenIcon,
    tone: "text-status-green",
    chip: "bg-status-green/15 text-status-green hover:bg-status-green/25",
  },
  Feature: {
    icon: LightbulbIcon,
    tone: "text-brand",
    chip: "bg-brand-soft text-brand hover:bg-brand/20",
  },
  Epic: {
    icon: ZapIcon,
    tone: "text-status-orange",
    chip: "bg-status-orange/15 text-status-orange",
  },
} as const satisfies Record<
  string,
  { icon: LucideIcon; tone: string; chip: string }
>;

export type WorkType = keyof typeof WORK_TYPES;

export const WORK_TYPE_OPTIONS = [
  "Task",
  "Bug",
  "Story",
  "Feature",
  "Epic",
] as const;

export const DEFAULT_WORK_TYPE: WorkType = "Task";

// type is text+CHECK, not a real enum, so this narrows a row that predates the constraint instead of throwing
export function workTypeOf(value?: string | null) {
  return WORK_TYPES[value as WorkType] ?? WORK_TYPES[DEFAULT_WORK_TYPE];
}

export function toWorkType(value?: string | null): WorkType {
  return value && value in WORK_TYPES ? (value as WorkType) : DEFAULT_WORK_TYPE;
}

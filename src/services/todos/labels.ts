// Mirrors the API's rules (todos.schema.ts, 0038), so the picker refuses what
// the server would and the optimistic chip is the one the server stores.
export const MAX_LABELS = 20;
export const MAX_LABEL_LENGTH = 40;

export function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export const labelsOf = (todo: { labels?: string[] | null }): string[] =>
  todo.labels ?? [];

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function hasLabel(labels: string[], name: string): boolean {
  return labels.some((label) => same(label, name));
}

export function withLabel(labels: string[], name: string): string[] {
  return hasLabel(labels, name) ? labels : [...labels, name];
}

export function withoutLabel(labels: string[], name: string): string[] {
  return labels.filter((label) => !same(label, name));
}

export interface LabelUse {
  name: string;
  count: number;
}

// The board's labels are whatever its cards carry: there is no catalogue to
// manage. The first spelling seen names a label that differs only by case.
export function labelCatalog(
  todos: { labels?: string[] | null }[],
): LabelUse[] {
  const byKey = new Map<string, LabelUse>();

  for (const todo of todos) {
    for (const label of labelsOf(todo)) {
      const key = label.toLowerCase();
      const use = byKey.get(key);

      if (use) use.count += 1;
      else byKey.set(key, { name: label, count: 1 });
    }
  }

  return [...byKey.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

// Tinted from the existing palette, never a new colour: the text stays ink, so
// every tone reads at the same contrast and the dot or the border carries the hue.
export const LABEL_TONES = [
  { chip: "bg-brand/10", dot: "bg-brand", border: "border-brand/55" },
  {
    chip: "bg-status-blue/12",
    dot: "bg-status-blue",
    border: "border-status-blue/55",
  },
  {
    chip: "bg-status-green/12",
    dot: "bg-status-green",
    border: "border-status-green/60",
  },
  {
    chip: "bg-status-orange/14",
    dot: "bg-status-orange",
    border: "border-status-orange/65",
  },
  {
    chip: "bg-status-red/10",
    dot: "bg-status-red",
    border: "border-status-red/55",
  },
  { chip: "bg-ink/[0.07]", dot: "bg-ink-3", border: "border-ink/25" },
] as const;

export function labelTone(name: string): (typeof LABEL_TONES)[number] {
  let hash = 0;

  for (const char of name.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return LABEL_TONES[Math.abs(hash) % LABEL_TONES.length]!;
}

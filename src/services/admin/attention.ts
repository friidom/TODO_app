import type { AgingBucket } from "./types";

export type AttentionKey = "single_superadmin" | "stale_work";

export interface AttentionItem {
  key: AttentionKey;
  count: number;
  to: string;
  // What the count is out of, when that is known exactly.
  of?: number;
}

export const STALE_DAYS = 30;

// Only what the endpoints already count exactly. One active superadmin is the
// case Atlassian warns about: lose that account and nobody can grant the role.
export function attentionItems(
  activeSuperadmins: number | undefined,
  aging: AgingBucket[] | undefined,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (activeSuperadmins === 1) {
    items.push({ key: "single_superadmin", count: 1, to: "/admin/access" });
  }

  const stale = (aging ?? [])
    .filter((bucket) => bucket.from_days >= STALE_DAYS)
    .reduce((sum, bucket) => sum + bucket.count, 0);

  if (stale > 0) {
    const inFlight = (aging ?? []).reduce(
      (sum, bucket) => sum + bucket.count,
      0,
    );

    items.push({
      key: "stale_work",
      count: stale,
      to: "/admin/flow",
      of: inFlight,
    });
  }

  return items;
}

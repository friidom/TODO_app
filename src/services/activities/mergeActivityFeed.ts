import type { Activity, Comment } from "@/types/data";

export type FeedEntry =
  | { kind: "comment"; at: string; comment: Comment }
  | { kind: "history"; at: string; activity: Activity };

// String comparison, not Date parsing — every timestamp is ISO 8601 with fixed-width fields, so lexicographic order already matches chronological order.
export function mergeActivityFeed(
  comments: Comment[],
  activities: Activity[],
): FeedEntry[] {
  const entries: FeedEntry[] = [
    ...comments.map((comment): FeedEntry => ({
      kind: "comment",
      at: comment.created_at,
      comment,
    })),
    ...activities.map((activity): FeedEntry => ({
      kind: "history",
      at: activity.created_at,
      activity,
    })),
  ];

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

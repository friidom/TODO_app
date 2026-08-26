import type { Activity, Comment } from "@/types/data";

/**
 * The "All" tab's ordering (M25) — comments and history interleaved by when
 * they happened, newest first.
 *
 * **Pure, and separate from the two components that render it.** `CommentRow`
 * renders a `Comment` and `HistoryRow` renders an `Activity`; this function
 * knows about neither's markup, only about `created_at`. That is what lets it
 * be tested without mounting either row — the ordering is the risk here, not
 * the rendering.
 *
 * A discriminated union rather than a lowest-common-denominator row shape:
 * `Comment` and `Activity` share no fields worth unifying beyond a timestamp,
 * and forcing one would mean inventing placeholder values on whichever side
 * does not have them.
 */
export type FeedEntry =
  | { kind: "comment"; at: string; comment: Comment }
  | { kind: "history"; at: string; activity: Activity };

/**
 * Newest first, by `created_at` string comparison.
 *
 * String comparison rather than `Date` parsing: every timestamp here is a
 * Postgres `timestamptz` serialised as ISO 8601 with a fixed-width date and
 * time portion, so lexicographic order already agrees with chronological
 * order — the same property `comments/cache.ts`'s own `byPostedAt` relies on,
 * just reversed here for newest-first instead of oldest-first.
 */
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

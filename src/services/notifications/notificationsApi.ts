import { supabase } from "../api/supabase";
import type { Notification } from "./notifications";

/**
 * The inbox's queries (M22).
 *
 * **RLS is the whole of the scoping**, exactly as on the For You page: the
 * SELECT policy is `user_id = auth.uid()`, so a query with no filter already
 * returns only the caller's rows. Adding `.eq("user_id", …)` on top would be a
 * second definition of "mine" that could disagree with the policy — and the
 * policy is the one that is enforced.
 */

/**
 * How many rows the inbox holds.
 *
 * A bounded recent list, not an archive — same reasoning as `ACTIVITY_PAGE` and
 * `FEED_PAGE`, and the same absence of pagination behind it. The unread *count*
 * is not bounded by this: it is a separate `head` query, so a badge stays
 * correct past the hundredth notification.
 */
export const NOTIFICATION_PAGE = 50;

/** The columns the inbox reads. One list, so the four queries cannot drift. */
const NOTIFICATION_FIELDS =
  "id, user_id, type, board_id, entity_type, entity_id, actor_id, payload, read_at, created_at";

/** The caller's inbox, newest first. */
export async function fetchNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_FIELDS)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATION_PAGE);

  if (error) throw error;

  return (data ?? []) as Notification[];
}

/**
 * The badge's number, without fetching the rows.
 *
 * `head: true` with an exact count is a `COUNT(*)` served by
 * `notifications_user_unread_idx` — the partial index over unread rows only —
 * and returns no body at all. The alternative, counting the fetched page, would
 * silently cap the badge at `NOTIFICATION_PAGE`.
 */
export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) throw error;

  return count ?? 0;
}

/**
 * Mark specific rows read.
 *
 * `read_at` is set from the client's clock rather than `now()`, which is a
 * deliberate small inaccuracy: this is "when you saw it", it is never compared
 * across users, and the alternative is an RPC for a timestamp nobody reads.
 * The UPDATE policy pins `user_id = auth.uid()` in both USING and WITH CHECK,
 * so passing somebody else's id here changes nothing.
 */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);

  if (error) throw error;
}

/** Mark everything unread as read. RLS scopes it to the caller's own rows. */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) throw error;
}

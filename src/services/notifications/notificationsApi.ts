import { supabase } from "../api/supabase";
import type { Notification } from "./notifications";

// RLS scopes everything here to the caller — no .eq("user_id", ...) needed, or wanted, since that'd be a second definition of "mine".

export const NOTIFICATION_PAGE = 50;

const NOTIFICATION_FIELDS =
  "id, user_id, type, board_id, entity_type, entity_id, actor_id, payload, read_at, created_at";

export async function fetchNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_FIELDS)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATION_PAGE);

  if (error) throw error;

  return (data ?? []) as Notification[];
}

// head-only exact count off the unread partial index, so the badge doesn't cap at NOTIFICATION_PAGE.
export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) throw error;

  return count ?? 0;
}

// read_at is the client's clock, not now() — it's "when you saw it", never compared across users.
export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);

  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) throw error;
}

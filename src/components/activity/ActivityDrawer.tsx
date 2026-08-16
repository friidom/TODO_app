import ActivityFeed from "./ActivityFeed";

/**
 * The board's history, in the drawer slot (M18).
 *
 * A wrapper rather than a component, since `ActivityFeed` grew a second caller:
 * the Summary tab shows the newest few entries in a widget, this shows the
 * whole page. Keeping the file means `BoardPage`'s drawer branch still names
 * the thing it opens.
 */
export default function ActivityDrawer({ boardId }: { boardId: string }) {
  return <ActivityFeed boardId={boardId} />;
}

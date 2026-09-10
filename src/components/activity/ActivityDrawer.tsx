import ActivityFeed from "./ActivityFeed";

export default function ActivityDrawer({ boardId }: { boardId: string }) {
  return <ActivityFeed boardId={boardId} />;
}

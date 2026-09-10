// The one place a query key is spelled out — every hook imports from here.

const PROFILE_ROOT = ["profile"] as const;

const COMMENT_ROOT = ["comments"] as const;

const FOR_YOU_ROOT = ["for-you"] as const;

const NOTIFICATION_ROOT = ["notifications"] as const;

export const queryKeys = {
  // boardId stays required even though it may be undefined — a route param not yet resolved keys a disabled query.
  todos: (boardId: string | undefined) => ["todos", boardId] as const,

  columns: (boardId: string | undefined) => ["columns", boardId] as const,

  sprints: (boardId: string | undefined) => ["sprints", boardId] as const,

  boards: () => ["boards"] as const,

  spaces: () => ["spaces"] as const,

  board: (boardId: string | undefined) => ["board", boardId] as const,

  members: (boardId: string | undefined) => ["members", boardId] as const,

  invites: (boardId: string | undefined) => ["invites", boardId] as const,

  inviteeSearch: (boardId: string | undefined, query: string) =>
    ["invitee-search", boardId, query] as const,

  inviteeSearches: (boardId: string | undefined) =>
    ["invitee-search", boardId] as const,

  myInvites: () => ["my-invites"] as const,

  // Trigger-written table — nothing invalidates this, see useActivities.
  activities: (boardId: string | undefined) => ["activities", boardId] as const,

  todoActivities: (todoId: string | undefined) =>
    ["todo-activities", todoId] as const,

  todo: (todoId: string | undefined) => ["todo", todoId] as const,

  comments: (todoId: string | undefined) => [...COMMENT_ROOT, todoId] as const,

  // A realtime DELETE payload is only the primary key, so the thread it belonged to must be found via this prefix.
  commentThreads: () => COMMENT_ROOT,

  attachments: (todoId: string | undefined) => ["attachments", todoId] as const,

  // Keyed by the sorted paths, not the todo — the entry should change exactly when the set of files does.
  attachmentPreviews: (paths: string[]) =>
    ["attachment-previews", [...paths].sort().join(",")] as const,

  forYou: () => FOR_YOU_ROOT,

  forYouRecent: () => [...FOR_YOU_ROOT, "recent"] as const,

  forYouAssigned: (userId: string | undefined) =>
    [...FOR_YOU_ROOT, "assigned", userId] as const,

  forYouWorkedOn: (userId: string | undefined) =>
    [...FOR_YOU_ROOT, "worked-on", userId] as const,

  forYouByIds: (ids: string[]) =>
    [...FOR_YOU_ROOT, "by-ids", [...ids].sort().join(",")] as const,

  notifications: () => NOTIFICATION_ROOT,

  notificationList: () => [...NOTIFICATION_ROOT, "list"] as const,

  notificationUnread: () => [...NOTIFICATION_ROOT, "unread"] as const,

  profiles: () => PROFILE_ROOT,

  profile: (userId: string | undefined) => [...PROFILE_ROOT, userId] as const,

  usernameAvailability: (username: string) =>
    ["username-availability", username] as const,
};

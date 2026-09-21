import type { AdminActivityEvent } from "./socket";

export interface AdminFeedScope {
  board?: string;
  space?: string;
  spaceBoardIds?: string[];
}

export interface AdminActivityEffects {
  activity: boolean;
  task: string | null;
}

export function matchesAdminScope(
  event: AdminActivityEvent,
  scope: AdminFeedScope,
): boolean {
  if (scope.board !== undefined) return event.boardId === scope.board;

  // Without the space's board list there is no way to tell, and refetching a
  // feed the event cannot belong to is worse than missing one beat.
  if (scope.space !== undefined) {
    return scope.spaceBoardIds?.includes(event.boardId) ?? false;
  }

  return true;
}

export function adminActivityEffects(
  event: AdminActivityEvent,
  scope: AdminFeedScope,
  openTaskId?: string,
): AdminActivityEffects {
  return {
    activity: matchesAdminScope(event, scope),
    task:
      openTaskId !== undefined && event.entityId === openTaskId
        ? openTaskId
        : null,
  };
}

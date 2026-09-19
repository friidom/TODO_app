import { boardRoom, type RealtimeServer } from "./io.js";

// boardId → userId → the sockets that user holds on that board. In memory
// because there is one backend process; a second instance is the trigger to
// move this, and nothing else about the design changes when it does.
//
// Keyed by user and not by socket: one person with three tabs is one viewer,
// and only their last tab leaving makes them absent.
const boards = new Map<string, Map<string, Set<string>>>();

export function addViewer(boardId: string, userId: string, socketId: string): void {
  let viewers = boards.get(boardId);

  if (viewers === undefined) {
    viewers = new Map();
    boards.set(boardId, viewers);
  }

  let sockets = viewers.get(userId);

  if (sockets === undefined) {
    sockets = new Set();
    viewers.set(userId, sockets);
  }

  sockets.add(socketId);
}

export function removeViewer(boardId: string, userId: string, socketId: string): void {
  const viewers = boards.get(boardId);

  if (viewers === undefined) return;

  const sockets = viewers.get(userId);

  if (sockets === undefined) return;

  sockets.delete(socketId);

  if (sockets.size === 0) viewers.delete(userId);
  if (viewers.size === 0) boards.delete(boardId);
}

// Sorted rather than in arrival order: the client compares element-wise to
// decide whether to re-render, so an unstable order would repaint the board
// every time anyone reconnected.
export function viewersOf(boardId: string): string[] {
  return [...(boards.get(boardId)?.keys() ?? [])].sort();
}

export function syncPresence(io: RealtimeServer, boardId: string): void {
  io.to(boardRoom(boardId)).emit("presence:sync", {
    boardId,
    viewers: viewersOf(boardId),
  });
}

export function resetPresence(): void {
  boards.clear();
}

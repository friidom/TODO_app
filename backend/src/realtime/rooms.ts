import { superadminRoleOf } from "../middleware/requireSuperadmin.js";
import { roleOf } from "../modules/members/members.repo.js";
import {
  adminRoom,
  boardRoom,
  realtime,
  userRoom,
  type RealtimeServer,
  type RealtimeSocket,
} from "./io.js";
import { addViewer, removeViewer, syncPresence } from "./presence.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Join is the authorization boundary, and it is a different question from the
// handshake's: the handshake said who this socket is, this says which board it
// may read. It goes through the same roleOf the REST middleware uses — a
// second membership rule here is a second thing to keep in step.
export function registerRoomHandlers(io: RealtimeServer, socket: RealtimeSocket): void {
  socket.on("board:join", (boardId, ack) => {
    void (async () => {
      const allowed = await mayRead(boardId, socket.data.actor.id);

      if (!allowed) {
        respond(ack, false);

        return;
      }

      await socket.join(boardRoom(boardId));
      socket.data.boards.add(boardId);
      addViewer(boardId, socket.data.actor.id, socket.id);
      respond(ack, true);
      syncPresence(io, boardId);
    })();
  });

  // Same shape as board:join and the same principle: the handshake said who
  // this socket is, this says whether it may watch the system. A superadmin is
  // not a member of the boards they watch, so boardRoom would refuse them.
  socket.on("admin:join", (ack) => {
    void (async () => {
      const allowed = (await superadminRoleOf(socket.data.actor.id)) !== null;

      if (allowed) await socket.join(adminRoom());

      respond(ack, allowed);
    })();
  });

  socket.on("admin:leave", () => {
    void socket.leave(adminRoom());
  });

  socket.on("board:leave", (boardId) => {
    void leaveBoard(io, socket, boardId);
  });

  socket.on("disconnect", () => {
    for (const boardId of socket.data.boards) {
      removeViewer(boardId, socket.data.actor.id, socket.id);
      syncPresence(io, boardId);
    }

    socket.data.boards.clear();
  });
}

async function mayRead(boardId: unknown, userId: string): Promise<boolean> {
  // A malformed id cannot name a board, and keeping it out of the query is
  // what stops it surfacing as a 22P02 from inside a socket handler.
  if (typeof boardId !== "string" || !UUID.test(boardId)) return false;

  return (await roleOf(boardId, userId)) !== null;
}

// Acks are optional on the wire: a client that emits without a callback would
// otherwise crash the handler on a non-function.
function respond(ack: unknown, ok: boolean): void {
  if (typeof ack === "function") (ack as (result: { ok: boolean }) => void)({ ok });
}

async function leaveBoard(
  io: RealtimeServer,
  socket: RealtimeSocket,
  boardId: string,
): Promise<void> {
  if (!socket.data.boards.has(boardId)) return;

  await socket.leave(boardRoom(boardId));
  socket.data.boards.delete(boardId);
  removeViewer(boardId, socket.data.actor.id, socket.id);
  syncPresence(io, boardId);
}

// A deleted board has no membership left to check, so eviction by user would
// have nobody to name. Everyone still in the room is turned out at once.
export async function closeBoardRoom(boardId: string): Promise<void> {
  const io = realtime();

  if (io === null) return;

  const sockets = await io.in(boardRoom(boardId)).fetchSockets();

  for (const remote of sockets) {
    remote.leave(boardRoom(boardId));
    remote.data.boards.delete(boardId);
    removeViewer(boardId, remote.data.actor.id, remote.id);
    remote.emit("board:evicted", { boardId });
  }
}

// Join-time authorization is not enough on its own: a socket authorized once
// and never re-checked keeps receiving a board's traffic until the tab closes,
// which is a wider window than the RLS it replaces. Every membership change
// that can remove access calls this.
export async function evictFromBoard(boardId: string, userId: string): Promise<void> {
  const io = realtime();

  if (io === null) return;

  const sockets = await io.in(userRoom(userId)).fetchSockets();

  for (const remote of sockets) {
    if (!remote.data.boards.has(boardId)) continue;

    remote.leave(boardRoom(boardId));
    remote.data.boards.delete(boardId);
    removeViewer(boardId, userId, remote.id);
    remote.emit("board:evicted", { boardId });
  }

  syncPresence(io, boardId);
}

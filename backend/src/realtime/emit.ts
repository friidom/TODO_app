import { adminRoom, boardRoom, realtime, type Scope } from "./io.js";

type Entity = "todo" | "column" | "comment";

// Every emitter is called AFTER the write has committed. Emitting from inside
// a transaction means a rollback still broadcast, and clients would hold rows
// the database does not have with nothing to correct them.

// The shape services/realtime/events.ts on the frontend already parses, so
// that file and its 34 tests do not change.
export function emitChange<T extends object>(
  boardId: string,
  entity: Entity,
  eventType: "INSERT" | "UPDATE",
  row: T,
): void {
  realtime()
    ?.to(boardRoom(boardId))
    .emit(`${entity}:change`, {
      eventType,
      new: row as Record<string, unknown>,
      old: {},
    });

  emitAdminActivity(boardId, entity, (row as { id?: string }).id ?? null);
}

// Fans out beside the board room rather than from the services, because every
// write that produces an activity row already calls one of these three. The
// payload names the board and the entity and nothing else -- the admin
// surfaces re-read through their own endpoints, so no row leaves here.
export function emitAdminActivity(
  boardId: string,
  entity: string,
  entityId: string | null,
): void {
  realtime()?.to(adminRoom()).emit("admin:activity", { boardId, entity, entityId });
}

// The id and nothing else. We could now send the whole deleted row — the
// REPLICA IDENTITY DEFAULT that forced this is gone — but sending less than we
// could is never a bug, and it keeps the client unchanged.
export function emitDeleted(boardId: string, entity: Entity, id: string): void {
  realtime()
    ?.to(boardRoom(boardId))
    .emit(`${entity}:change`, { eventType: "DELETE", new: {}, old: { id } });

  emitAdminActivity(boardId, entity, id);
}

// For any write that touches more than one row. Enumerating them would mean N
// events for one user action, and the client can refetch a scope more cheaply
// than the server can describe every row it changed.
export function emitInvalidate(boardId: string, scopes: Scope[]): void {
  realtime()?.to(boardRoom(boardId)).emit("board:invalidate", { boardId, scopes });

  emitAdminActivity(boardId, scopes[0] ?? "board", null);
}

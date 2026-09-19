import type { Server as HttpServer } from "node:http";

import { Server, type Socket } from "socket.io";

import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { registerRoomHandlers } from "./rooms.js";

export type Scope =
  | "todos"
  | "columns"
  | "comments"
  | "attachments"
  | "sprints"
  | "members"
  | "boards";

export interface RowChange<T = Record<string, unknown>> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Partial<T>;
  old: Partial<T>;
}

export interface ServerToClientEvents {
  "todo:change": (change: RowChange) => void;
  "column:change": (change: RowChange) => void;
  "comment:change": (change: RowChange) => void;
  "board:invalidate": (payload: { boardId: string; scopes: Scope[] }) => void;
  "presence:sync": (payload: { boardId: string; viewers: string[] }) => void;
  "board:evicted": (payload: { boardId: string }) => void;
}

export interface JoinResult {
  ok: boolean;
}

export interface ClientToServerEvents {
  "board:join": (boardId: string, ack: (result: JoinResult) => void) => void;
  "board:leave": (boardId: string) => void;
}

// Mirrors express.d.ts's `Request.actor`, and for the same reason: everything
// downstream reads the identity from here rather than re-reading the token.
// `boards` is what this socket has been authorized for, so a disconnect can
// clean up presence without asking the rooms it happens to be in.
export interface SocketData {
  actor: { id: string };
  boards: Set<string>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {}

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function boardRoom(boardId: string): string {
  return `board:${boardId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

// `handshake.auth`, not a cookie and not the query string. The refresh cookie
// is scoped to Path=/api/v1/auth and is deliberately not sent here; the query
// string would put a bearer token in nginx's and morgan's access logs.
function tokenFrom(socket: RealtimeSocket): string | null {
  const { token } = socket.handshake.auth as { token?: unknown };

  return typeof token === "string" && token !== "" ? token : null;
}

// The services reach realtime through this rather than through an injected
// dependency: they are module functions called from controllers, and threading
// a server instance down four layers to reach them would change every
// signature. Null until the server starts, which is what makes REST-only
// tests and the integration suite emit nothing instead of failing.
let current: RealtimeServer | null = null;

export function realtime(): RealtimeServer | null {
  return current;
}

export function setRealtimeServer(io: RealtimeServer | null): void {
  current = io;
}

// Socket.IO does not run Express middleware, so `cors()` in app.ts does not
// cover the handshake — the origin has to be pinned again here.
export function createRealtimeServer(httpServer: HttpServer): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

  // Authenticates the CONNECTION, once. It says who the caller is and nothing
  // about what they may see: board membership is per board and changes, so it
  // is checked on join and re-checked on membership change (rooms.ts).
  io.use((socket, next) => {
    const token = tokenFrom(socket);

    if (token === null) {
      next(new AppError("unauthorized", "Not authenticated."));

      return;
    }

    try {
      const { userId } = verifyAccessToken(token);

      socket.data.actor = { id: userId };
      socket.data.boards = new Set();
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  io.on("connection", (socket) => {
    // Lets eviction address a person rather than a connection — one user may
    // hold several tabs, and all of them lose access at the same moment.
    void socket.join(userRoom(socket.data.actor.id));

    registerRoomHandlers(io, socket);
  });

  setRealtimeServer(io);

  return io;
}

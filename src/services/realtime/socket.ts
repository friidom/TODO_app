import { io, type Socket } from "socket.io-client";

import { apiBaseUrl, getAccessToken } from "@/services/api/client";
import type { Scope } from "./keysForScopes";
import type { RowChange } from "./events";
import type { Comment, IColumn, Todo } from "@/types/data";

export const SOCKET_PATH = "/api/v1/socket.io";

export interface ServerToClientEvents {
  "todo:change": (change: RowChange<Todo>) => void;
  "column:change": (change: RowChange<IColumn>) => void;
  "comment:change": (change: RowChange<Comment>) => void;
  "board:invalidate": (payload: { boardId: string; scopes: Scope[] }) => void;
  "presence:sync": (payload: { boardId: string; viewers: string[] }) => void;
  "board:evicted": (payload: { boardId: string }) => void;
  "admin:activity": (payload: AdminActivityEvent) => void;
}

export interface AdminActivityEvent {
  boardId: string;
  entity: string;
  entityId: string | null;
}

export interface ClientToServerEvents {
  "board:join": (boardId: string, ack: (result: { ok: boolean }) => void) => void;
  "board:leave": (boardId: string) => void;
  "admin:join": (ack: (result: { ok: boolean }) => void) => void;
  "admin:leave": () => void;
}

export type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// VITE_API_URL is absolute in dev and relative ("/api/v1") under Docker, where
// nginx serves both. Resolving against the page gives the right origin either
// way without a second environment variable.
export function resolveSocketOrigin(apiUrl: string, pageUrl: string): string {
  return new URL(apiUrl, pageUrl).origin;
}

export function connectBoardSocket(): BoardSocket {
  return io(resolveSocketOrigin(apiBaseUrl, window.location.href), {
    path: SOCKET_PATH,
    // A function, not an object: it is re-evaluated on every reconnect, and
    // the access token rotates every fifteen minutes.
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket", "polling"],
    withCredentials: true,
  });
}

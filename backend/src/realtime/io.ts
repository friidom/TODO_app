import type { Server as HttpServer } from "node:http";

import { Server, type DefaultEventsMap, type Socket } from "socket.io";

import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";

// Mirrors express.d.ts's `Request.actor`, and for the same reason: everything
// downstream reads the identity from here rather than re-reading the token.
export interface SocketData {
  actor: { id: string };
}

export type RealtimeServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export type RealtimeSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

// `handshake.auth`, not a cookie and not the query string. The refresh cookie
// is scoped to Path=/api/v1/auth and is deliberately not sent here; the query
// string would put a bearer token in nginx's and morgan's access logs.
function tokenFrom(socket: RealtimeSocket): string | null {
  const { token } = socket.handshake.auth as { token?: unknown };

  return typeof token === "string" && token !== "" ? token : null;
}

// Socket.IO does not run Express middleware, so `cors()` in app.ts does not
// cover the handshake — the origin has to be pinned again here.
export function createRealtimeServer(httpServer: HttpServer): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

  // Authenticates the CONNECTION, once. It says who the caller is and nothing
  // about what they may see: board membership is per board and changes, so it
  // is checked on join and re-checked on membership change (B9-C), never here.
  io.use((socket, next) => {
    const token = tokenFrom(socket);

    if (token === null) {
      next(new AppError("unauthorized", "Not authenticated."));

      return;
    }

    try {
      const { userId } = verifyAccessToken(token);

      socket.data.actor = { id: userId };
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  return io;
}

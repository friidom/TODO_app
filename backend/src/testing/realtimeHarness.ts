import { createServer, type Server as HttpServer } from "node:http";

import { io as connect, type Socket as ClientSocket } from "socket.io-client";

import { app } from "../app.js";
import { resetPresence } from "../realtime/presence.js";
import { createRealtimeServer, setRealtimeServer, type RealtimeServer } from "../realtime/io.js";

const TIMEOUT = 3000;

export interface TestSocket {
  id: string;
  raw: ClientSocket;
  join(boardId: string): Promise<{ ok: boolean }>;
  leave(boardId: string): void;
  waitFor<T>(event: string, match?: (payload: T) => boolean): Promise<T>;
  seen<T>(event: string): T[];
  disconnect(): Promise<void>;
}

export interface RealtimeHarness {
  url: string;
  io: RealtimeServer;
  connect(token: string): Promise<TestSocket>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

const WATCHED = [
  "todo:change",
  "column:change",
  "comment:change",
  "board:invalidate",
  "presence:sync",
  "board:evicted",
] as const;

export async function startRealtimeHarness(): Promise<RealtimeHarness> {
  const server: HttpServer = createServer(app);
  const io = createRealtimeServer(server);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("realtime harness did not bind a port");
  }

  const url = `http://127.0.0.1:${address.port}`;
  const open = new Set<TestSocket>();

  async function connectAs(token: string): Promise<TestSocket> {
    const raw = connect(url, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });

    const log = new Map<string, unknown[]>();
    const waiters: { event: string; match: (p: unknown) => boolean; resolve: (p: unknown) => void }[] =
      [];

    for (const event of WATCHED) {
      raw.on(event, (payload: unknown) => {
        log.set(event, [...(log.get(event) ?? []), payload]);

        const index = waiters.findIndex((w) => w.event === event && w.match(payload));

        if (index !== -1) waiters.splice(index, 1)[0].resolve(payload);
      });
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("connect timed out")), TIMEOUT);

      raw.on("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      raw.on("connect_error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    const client: TestSocket = {
      id: raw.id ?? "",
      raw,

      join: (boardId) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("join timed out")), TIMEOUT);

          raw.emit("board:join", boardId, (result: { ok: boolean }) => {
            clearTimeout(timer);
            resolve(result);
          });
        }),

      leave: (boardId) => {
        raw.emit("board:leave", boardId);
      },

      waitFor: <T,>(event: string, match: (payload: T) => boolean = () => true) => {
        const buffered = (log.get(event) ?? []) as T[];
        const hit = buffered.find(match);

        if (hit !== undefined) return Promise.resolve(hit);

        return new Promise<T>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`timed out waiting for ${event}`)),
            TIMEOUT,
          );

          waiters.push({
            event,
            match: match as (p: unknown) => boolean,
            resolve: (payload) => {
              clearTimeout(timer);
              resolve(payload as T);
            },
          });
        });
      },

      seen: <T,>(event: string) => (log.get(event) ?? []) as T[],

      disconnect: () =>
        new Promise<void>((resolve) => {
          if (!raw.connected) {
            resolve();

            return;
          }

          raw.on("disconnect", () => resolve());
          raw.disconnect();
        }),
    };

    open.add(client);

    return client;
  }

  return {
    url,
    io,
    connect: connectAs,

    // Server-side disconnect handlers run a tick after the client's, so
    // presence is cleared explicitly rather than raced against.
    reset: async () => {
      await Promise.all([...open].map((client) => client.disconnect()));
      open.clear();
      resetPresence();
    },

    close: async () => {
      await Promise.all([...open].map((client) => client.disconnect()));
      open.clear();
      resetPresence();

      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });

      setRealtimeServer(null);
    },
  };
}

// Socket.IO delivers asynchronously; a test that asserts "nothing arrived"
// has to give the thing that must not arrive a chance to.
export function settle(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

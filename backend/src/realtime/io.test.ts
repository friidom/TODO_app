import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";
import { io as connect } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../app.js";
import { env } from "../config/env.js";
import { signAccessToken } from "../lib/tokens.js";
import { createRealtimeServer, SOCKET_PATH, type RealtimeServer } from "./io.js";

let server: HttpServer;
let io: RealtimeServer;
let url: string;

beforeAll(async () => {
  server = createServer(app);
  io = createRealtimeServer(server);

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("test server did not bind a port");
  }

  url = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    io.close(() => resolve());
  });
});

type Attempt = { ok: true; socketId: string } | { ok: false; message: string };

async function attempt(auth: Record<string, unknown>): Promise<Attempt> {
  const socket = connect(url, {
    path: SOCKET_PATH,
    auth,
    transports: ["websocket"],
    reconnection: false,
  });

  try {
    return await new Promise<Attempt>((resolve) => {
      socket.on("connect", () => resolve({ ok: true, socketId: socket.id ?? "" }));
      socket.on("connect_error", (error) => resolve({ ok: false, message: error.message }));
    });
  } finally {
    socket.disconnect();
  }
}

describe("socket.io handshake authentication", () => {
  it("accepts a connection carrying a valid access token", async () => {
    const { accessToken } = signAccessToken(randomUUID());

    await expect(attempt({ token: accessToken })).resolves.toMatchObject({ ok: true });
  });

  it("attaches the caller's id to the socket, so nothing downstream re-reads the token", async () => {
    const userId = randomUUID();
    const { accessToken } = signAccessToken(userId);

    const result = await attempt({ token: accessToken });

    if (!result.ok) throw new Error(`expected a connection, got: ${result.message}`);

    expect(io.sockets.sockets.get(result.socketId)?.data.actor).toEqual({ id: userId });
  });

  it("refuses a connection with no token at all", async () => {
    await expect(attempt({})).resolves.toEqual({ ok: false, message: "Not authenticated." });
  });

  it("refuses a token signed with another secret", async () => {
    const forged = jwt.sign({}, "a-different-secret-of-at-least-32-characters", {
      algorithm: "HS256",
      subject: randomUUID(),
      jwtid: randomUUID(),
      expiresIn: "15m",
    });

    await expect(attempt({ token: forged })).resolves.toEqual({
      ok: false,
      message: "Not authenticated.",
    });
  });

  it("refuses an expired token", async () => {
    const expired = jwt.sign({}, env.JWT_SECRET, {
      algorithm: "HS256",
      subject: randomUUID(),
      jwtid: randomUUID(),
      expiresIn: -60,
    });

    await expect(attempt({ token: expired })).resolves.toEqual({
      ok: false,
      message: "Not authenticated.",
    });
  });
});

describe("the REST API on the same server", () => {
  it("still answers, with Socket.IO attached to the very same http.Server", async () => {
    const response = await fetch(`${url}/api/v1`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ version: "v1", status: "ok" });
  });
});

import { describe, expect, it, vi } from "vitest";

import { recoverRefusedConnections, resolveSocketOrigin, SOCKET_PATH } from "./socket";

describe("resolveSocketOrigin", () => {
  it("uses the API's own origin when VITE_API_URL is absolute, as it is in dev", () => {
    expect(
      resolveSocketOrigin("http://localhost:4000/api/v1", "http://localhost:5173/boards/x"),
    ).toBe("http://localhost:4000");
  });

  it("uses the page's origin when VITE_API_URL is relative, as it is under Docker", () => {
    expect(resolveSocketOrigin("/api/v1", "http://localhost:3000/boards/x")).toBe(
      "http://localhost:3000",
    );
  });

  it("keeps the scheme, so a TLS deployment does not fall back to ws://", () => {
    expect(resolveSocketOrigin("/api/v1", "https://kan.example.com/boards/x")).toBe(
      "https://kan.example.com",
    );
  });

  it("carries a non-default port through", () => {
    expect(resolveSocketOrigin("/api/v1", "http://192.168.1.10:8080/")).toBe(
      "http://192.168.1.10:8080",
    );
  });
});

describe("SOCKET_PATH", () => {
  it("sits under the API prefix, so nginx needs no second location block", () => {
    expect(SOCKET_PATH).toBe("/api/v1/socket.io");
  });
});

function fakeSocket() {
  const listeners: Record<string, (() => void)[]> = {};

  return {
    active: false,
    connect: vi.fn(),
    on(event: "connect" | "connect_error", listener: () => void) {
      (listeners[event] ??= []).push(listener);
    },
    fire(event: "connect" | "connect_error") {
      for (const listener of listeners[event] ?? []) listener();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("recoverRefusedConnections", () => {
  it("refreshes once and reconnects when the server refuses the token", async () => {
    const socket = fakeSocket();
    const refresh = vi.fn(async () => true);

    recoverRefusedConnections(socket, refresh);
    socket.fire("connect_error");
    socket.fire("connect_error");
    await flush();

    expect(refresh).toHaveBeenCalledOnce();
    expect(socket.connect).toHaveBeenCalledOnce();
  });

  it("leaves a transient failure to Socket.IO's own retries", async () => {
    const socket = fakeSocket();
    const refresh = vi.fn(async () => true);

    socket.active = true;
    recoverRefusedConnections(socket, refresh);
    socket.fire("connect_error");
    await flush();

    expect(refresh).not.toHaveBeenCalled();
  });

  it("stays disconnected when the session is over or unreachable", async () => {
    for (const refresh of [vi.fn(async () => false), vi.fn(() => Promise.reject(new Error("503")))]) {
      const socket = fakeSocket();

      recoverRefusedConnections(socket, refresh);
      socket.fire("connect_error");
      await flush();

      expect(socket.connect).not.toHaveBeenCalled();
    }
  });

  it("recovers again after a connection that succeeded", async () => {
    const socket = fakeSocket();
    const refresh = vi.fn(async () => true);

    recoverRefusedConnections(socket, refresh);
    socket.fire("connect_error");
    await flush();
    socket.fire("connect");
    socket.fire("connect_error");
    await flush();

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

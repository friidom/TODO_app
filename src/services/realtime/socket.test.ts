import { describe, expect, it } from "vitest";

import { resolveSocketOrigin, SOCKET_PATH } from "./socket";

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

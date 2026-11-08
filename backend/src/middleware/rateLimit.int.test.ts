import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { disconnect, resetDatabase } from "../testing/db.js";
import { startTestServer, type TestClient } from "../testing/httpClient.js";

vi.mock("../config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../config/env.js")>();

  return { ...original, env: { ...original.env, TRUST_PROXY: 2 } };
});

let client: TestClient;

beforeAll(async () => {
  client = await startTestServer();
  await resetDatabase();
});

afterAll(async () => {
  await client.close();
  await disconnect();
});

// What the frontend nginx forwards in production: the client as the host
// nginx saw it, then the host nginx itself.
function refresh(clientIp: string, options: { cookie?: boolean; spoof?: string } = {}) {
  const chain = [options.spoof, clientIp, "172.18.0.1"].filter(Boolean).join(", ");
  const headers: Record<string, string> = { "x-forwarded-for": chain };

  if (options.cookie !== false) headers.cookie = "refresh=not-a-real-token";

  return fetch(`${client.url}/api/v1/auth/refresh`, { method: "POST", headers }).then((r) => r.status);
}

describe("refresh limiter behind two proxies", () => {
  it("gives each client its own bucket", async () => {
    for (let i = 0; i < 120; i += 1) expect(await refresh("198.51.100.1")).toBe(401);

    expect(await refresh("198.51.100.1")).toBe(429);
    expect(await refresh("198.51.100.2")).toBe(401);
  });

  it("ignores addresses a client prepends to X-Forwarded-For", async () => {
    for (let i = 0; i < 120; i += 1) await refresh("198.51.100.3", { spoof: `10.9.${i}.1` });

    expect(await refresh("198.51.100.3", { spoof: "10.200.0.1" })).toBe(429);
  });

  it("does not count requests that carry no refresh cookie", async () => {
    for (let i = 0; i < 130; i += 1) expect(await refresh("198.51.100.4", { cookie: false })).toBe(401);

    expect(await refresh("198.51.100.4")).toBe(401);
  });
});

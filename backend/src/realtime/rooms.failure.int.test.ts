import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { disconnect, resetDatabase } from "../testing/db.js";
import { makeUser } from "../testing/fixtures.js";
import { startRealtimeHarness, type RealtimeHarness } from "../testing/realtimeHarness.js";
import { startTestServer, type TestClient } from "../testing/httpClient.js";

const failing = vi.hoisted(() => ({ lookups: false }));

// A pool that cannot hand out a connection in time rejects the lookup; that is
// the failure being simulated, for the two lookups the join handlers make.
vi.mock("../modules/members/members.repo.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../modules/members/members.repo.js")>();

  return {
    ...original,
    roleOf: (...args: Parameters<typeof original.roleOf>) =>
      failing.lookups ? Promise.reject(new Error("timeout exceeded when trying to connect")) : original.roleOf(...args),
  };
});

vi.mock("../middleware/requireSuperadmin.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../middleware/requireSuperadmin.js")>();

  return {
    ...original,
    superadminRoleOf: (userId: string) =>
      failing.lookups ? Promise.reject(new Error("timeout exceeded when trying to connect")) : original.superadminRoleOf(userId),
  };
});

let harness: RealtimeHarness;
let rest: TestClient;

beforeAll(async () => {
  harness = await startRealtimeHarness();
  rest = await startTestServer();
});

beforeEach(async () => {
  failing.lookups = false;
  await resetDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
  await rest.close();
  await disconnect();
});

describe("a join whose lookup fails", () => {
  it("answers board:join with ok:false and the API keeps serving", async () => {
    const owner = await makeUser("owner");
    const socket = await harness.connect(owner.token);

    failing.lookups = true;

    await expect(socket.join(owner.boardId)).resolves.toEqual({ ok: false });
    expect((await rest.get("/health")).status).toBe(200);

    failing.lookups = false;

    await expect(socket.join(owner.boardId)).resolves.toEqual({ ok: true });
  });

  it("answers admin:join with ok:false", async () => {
    const owner = await makeUser("owner");
    const socket = await harness.connect(owner.token);

    failing.lookups = true;

    await expect(socket.joinAdmin()).resolves.toEqual({ ok: false });
    expect((await rest.get("/health")).status).toBe(200);
  });
});

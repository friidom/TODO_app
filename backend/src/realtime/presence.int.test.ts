import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { disconnect, resetDatabase } from "../testing/db.js";
import { addMember, makeUser } from "../testing/fixtures.js";
import { startRealtimeHarness, settle, type RealtimeHarness } from "../testing/realtimeHarness.js";

interface Sync {
  boardId: string;
  viewers: string[];
}

let harness: RealtimeHarness;

beforeAll(async () => {
  harness = await startRealtimeHarness();
});

beforeEach(resetDatabase);

afterEach(() => harness.reset());

afterAll(async () => {
  await harness.close();
  await disconnect();
});

describe("board presence over the socket", () => {
  it("tells the first arrival that they are the roster", async () => {
    const owner = await makeUser("owner");
    const socket = await harness.connect(owner.token);

    await socket.join(owner.boardId);

    const sync = await socket.waitFor<Sync>("presence:sync");

    expect(sync).toEqual({ boardId: owner.boardId, viewers: [owner.id] });
  });

  it("tells the people already there when someone else joins", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "editor", owner.id);

    const first = await harness.connect(owner.token);

    await first.join(owner.boardId);

    const second = await harness.connect(member.token);

    await second.join(owner.boardId);

    const expected = [owner.id, member.id].sort();

    await expect(
      first.waitFor<Sync>("presence:sync", (s) => s.viewers.length === 2),
    ).resolves.toEqual({ boardId: owner.boardId, viewers: expected });

    await expect(
      second.waitFor<Sync>("presence:sync", (s) => s.viewers.length === 2),
    ).resolves.toEqual({ boardId: owner.boardId, viewers: expected });
  });

  it("drops someone who leaves the board but stays connected", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "editor", owner.id);

    const staying = await harness.connect(owner.token);
    const leaving = await harness.connect(member.token);

    await staying.join(owner.boardId);
    await leaving.join(owner.boardId);
    await staying.waitFor<Sync>("presence:sync", (s) => s.viewers.length === 2);

    leaving.leave(owner.boardId);

    await expect(
      staying.waitFor<Sync>("presence:sync", (s) => s.viewers.length === 1),
    ).resolves.toEqual({ boardId: owner.boardId, viewers: [owner.id] });
  });

  it("drops someone whose socket disconnects without leaving first", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "editor", owner.id);

    const staying = await harness.connect(owner.token);
    const going = await harness.connect(member.token);

    await staying.join(owner.boardId);
    await going.join(owner.boardId);
    await staying.waitFor<Sync>("presence:sync", (s) => s.viewers.length === 2);

    await going.disconnect();

    await expect(
      staying.waitFor<Sync>("presence:sync", (s) => s.viewers.length === 1),
    ).resolves.toEqual({ boardId: owner.boardId, viewers: [owner.id] });
  });

  it("SHOWS ONE PERSON WITH TWO TABS ONCE, and keeps them until the second closes", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "editor", owner.id);

    const watcher = await harness.connect(owner.token);

    await watcher.join(owner.boardId);

    const tabOne = await harness.connect(member.token);
    const tabTwo = await harness.connect(member.token);

    await tabOne.join(owner.boardId);
    await tabTwo.join(owner.boardId);
    await settle();

    const latest = watcher.seen<Sync>("presence:sync").at(-1);

    expect(latest?.viewers).toEqual([owner.id, member.id].sort());

    await tabOne.disconnect();
    await settle();

    expect(watcher.seen<Sync>("presence:sync").at(-1)?.viewers).toEqual(
      [owner.id, member.id].sort(),
    );

    await tabTwo.disconnect();

    await expect(
      watcher.waitFor<Sync>("presence:sync", (s) => s.viewers.length === 1),
    ).resolves.toEqual({ boardId: owner.boardId, viewers: [owner.id] });
  });

  it("keeps two boards' rosters apart", async () => {
    const one = await makeUser("one");
    const two = await makeUser("two");

    const first = await harness.connect(one.token);
    const second = await harness.connect(two.token);

    await first.join(one.boardId);
    await second.join(two.boardId);
    await settle();

    expect(first.seen<Sync>("presence:sync").at(-1)).toEqual({
      boardId: one.boardId,
      viewers: [one.id],
    });
    expect(second.seen<Sync>("presence:sync").at(-1)).toEqual({
      boardId: two.boardId,
      viewers: [two.id],
    });
  });

  it("never reaches someone who is not a member of the board", async () => {
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");

    const outsider = await harness.connect(stranger.token);

    await expect(outsider.join(owner.boardId)).resolves.toEqual({ ok: false });

    const insider = await harness.connect(owner.token);

    await insider.join(owner.boardId);
    await settle();

    expect(outsider.seen("presence:sync")).toHaveLength(0);
  });

  it("removes an evicted member from the roster the rest can see", async () => {
    const owner = await makeUser("owner");
    const member = await makeUser("member");

    await addMember(owner.boardId, member, "editor", owner.id);

    const staying = await harness.connect(owner.token);
    const going = await harness.connect(member.token);

    await staying.join(owner.boardId);
    await going.join(owner.boardId);
    await staying.waitFor<Sync>("presence:sync", (s) => s.viewers.length === 2);

    const members = await import("../modules/members/members.service.js");

    await members.remove({ id: owner.id }, { id: owner.boardId, role: "owner" }, member.id);

    await expect(
      staying.waitFor<Sync>("presence:sync", (s) => s.viewers.length === 1),
    ).resolves.toEqual({ boardId: owner.boardId, viewers: [owner.id] });
  });
});

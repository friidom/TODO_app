import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../db/prisma.js";
import { withActor } from "../db/withActor.js";
import { disconnect, resetDatabase } from "./db.js";
import { addMember, firstColumnOf, makeUser } from "./fixtures.js";

beforeEach(resetDatabase);

afterAll(disconnect);

// §21.11, §21.12 and now 0009 are the same defect three times: a trigger
// inserting an activities row for a board the surrounding cascade has already
// removed, which fails the whole DELETE. Each fix closed one branch. These
// tests exercise the shapes rather than the branches, so a fourth instance
// fails here rather than in production.
describe("deleting an account or a board is never blocked by its own history", () => {
  async function boardWithAssignedWork() {
    const owner = await makeUser("owner");
    const assignee = await makeUser("assignee");

    await addMember(owner.boardId, assignee, "editor", owner.id);

    const column = await firstColumnOf(owner.boardId);

    await withActor(owner.id, (tx) =>
      tx.todos.create({
        data: {
          board_id: owner.boardId,
          column_id: column.id,
          title: "assigned work",
          assignee_id: assignee.id,
        },
      }),
    );

    return { owner, assignee };
  }

  // The 0009 case: profiles delete SET NULLs todos.assignee_id, which is an
  // UPDATE, which logs an 'assigned' activity against a vanishing board.
  it("deletes accounts when a todo is assigned to one of them", async () => {
    await boardWithAssignedWork();

    await expect(prisma.users.deleteMany({})).resolves.toBeDefined();
    expect(await prisma.users.count()).toBe(0);
    expect(await prisma.activities.count()).toBe(0);
  });

  it("deletes the board directly in the same shape", async () => {
    const { owner } = await boardWithAssignedWork();

    await expect(prisma.boards.delete({ where: { id: owner.boardId } })).resolves.toBeDefined();
    expect(await prisma.boards.count({ where: { id: owner.boardId } })).toBe(0);
  });

  it("deletes the assignee's account alone, leaving the board and card behind", async () => {
    const { owner, assignee } = await boardWithAssignedWork();

    await prisma.users.delete({ where: { id: assignee.id } });

    const todo = await prisma.todos.findFirstOrThrow({
      where: { board_id: owner.boardId },
      select: { assignee_id: true },
    });

    expect(todo.assignee_id).toBeNull();
    expect(await prisma.boards.count({ where: { id: owner.boardId } })).toBe(1);

    // The board survived, so the 'assigned' activity is legitimate and kept.
    expect(
      await prisma.activities.count({ where: { board_id: owner.boardId, action: "assigned" } }),
    ).toBeGreaterThan(0);
  });

  it("deletes a board carrying columns, members, comments and activity", async () => {
    const { owner } = await boardWithAssignedWork();
    const todo = await prisma.todos.findFirstOrThrow({
      where: { board_id: owner.boardId },
      select: { id: true },
    });

    await prisma.comments.create({
      data: {
        board_id: owner.boardId,
        todo_id: todo.id,
        author_id: owner.id,
        content: "a comment",
      },
    });

    await expect(prisma.boards.delete({ where: { id: owner.boardId } })).resolves.toBeDefined();

    for (const count of await Promise.all([
      prisma.columns.count({ where: { board_id: owner.boardId } }),
      prisma.todos.count({ where: { board_id: owner.boardId } }),
      prisma.comments.count({ where: { board_id: owner.boardId } }),
      prisma.activities.count({ where: { board_id: owner.boardId } }),
      prisma.board_members.count({ where: { board_id: owner.boardId } }),
    ])) {
      expect(count).toBe(0);
    }
  });
});

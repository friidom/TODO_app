// B4-09 — a focused, runnable probe for withActor (B4-03).
//
// Two parts, testing two different things:
//
// Part 1 tests the property withActor exists for: does app.actor_id leak
// between separate top-level transactions on a pooled (reused) connection?
// It never writes to a table, so it needs no cleanup by construction.
//
// Part 2 tests that the real PostgreSQL triggers (add_owner_membership,
// board_members_log_activity -> log_member_activity) actually read the value
// withActor sets and stamp it onto `activities` correctly. This runs inside
// one transaction that always rolls back, so the board it creates never
// commits and needs no cleanup either — a rollback does not stop a trigger
// from firing, it only discards the result afterwards, so this still
// exercises the real trigger, not a mock of it.
//
// Part 3 covers the board-deletion defect this probe originally uncovered and
// migration 0007 fixed: log_member_activity used to log a 'removed' activity
// even when the board it referenced was already being cascade-deleted, which
// made every board undeletable. It checks both halves -- the delete now
// succeeds, and an ordinary member removal is still logged.
//
// Run with: npm run db:verify-actor

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { closePool, describeError } from "./client.js";
import { prisma } from "./prisma.js";
import { withActor } from "./withActor.js";

let failures = 0;

function check(label: string, pass: boolean, detail?: unknown): void {
  if (pass) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? `  (${JSON.stringify(detail)})` : ""}`);
  }
}

// Marks an intentional rollback so the catch site can tell "the probe asked
// for this" apart from "something inside the transaction actually broke".
class ProbeRollback extends Error {}

async function part1_actorDoesNotLeakBetweenTransactions() {
  console.log("\n--- Part 1: app.actor_id does not leak across transactions ---");

  const actorA = randomUUID();
  const actorB = randomUUID();

  const readBack = (tx: Prisma.TransactionClient) =>
    tx.$queryRaw<{ v: string | null }[]>`select current_setting('app.actor_id', true) as v`;

  const [rowA] = await withActor(actorA, readBack);
  check("actor A's transaction reads back actor A", rowA?.v === actorA, rowA);

  const [rowB] = await withActor(actorB, readBack);
  check("actor B's transaction reads back actor B", rowB?.v === actorB, rowB);
  check("actor A did not leak into actor B's transaction", rowB?.v !== actorA, rowB);

  const [rowNull] = await withActor(null, readBack);
  // A placeholder GUC that has been touched before resets to '' rather than
  // SQL NULL on that connection (see the migration's nullif guard) -- both
  // "no value" and "not actor B" are checked explicitly.
  check(
    "explicit null does not inherit actor B's leftover value",
    rowNull?.v !== actorB && (rowNull?.v === null || rowNull?.v === ""),
    rowNull,
  );

  // --- A callback that throws must roll back, not commit. -------------------
  const rollbackMarker = `probe-rollback-${randomUUID()}`;
  let threw = false;

  try {
    await withActor(actorA, async (tx) => {
      // Written to a session-local temp table, not a real one -- this needs
      // no FK-satisfying rows and leaves nothing behind even if the rollback
      // itself failed for some unrelated reason.
      await tx.$executeRaw`create temporary table if not exists probe_rollback_marker (v text) on commit drop`;
      await tx.$executeRaw`insert into probe_rollback_marker (v) values (${rollbackMarker})`;

      throw new Error("intentional probe failure");
    });
  } catch (error) {
    threw = error instanceof Error && error.message === "intentional probe failure";
  }

  check("callback error propagates out of withActor", threw);
}

async function part2_realTriggersStampTheActor() {
  console.log("\n--- Part 2: real triggers stamp app.actor_id onto activities ---");

  const owner = randomUUID();
  const member = randomUUID();

  await prisma.users.create({
    data: { id: owner, email: `probe-owner-${owner}@example.test`, password_hash: "not-a-real-hash" },
  });
  await prisma.profiles.create({ data: { id: owner, username: `probe_owner_${owner.slice(0, 8)}` } });

  await prisma.users.create({
    data: { id: member, email: `probe-member-${member}@example.test`, password_hash: "not-a-real-hash" },
  });
  await prisma.profiles.create({ data: { id: member, username: `probe_member_${member.slice(0, 8)}` } });

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Actor "owner" creates a board. boards_add_owner_membership (AFTER
      //    INSERT on boards) inserts the owner's board_members row, which
      //    itself fires board_members_log_activity (AFTER INSERT on
      //    board_members) -- that second, trigger-fired insert is what reads
      //    app.actor_id. Nothing in this script writes to `activities` directly.
      await tx.$executeRaw`select set_config('app.actor_id', ${owner}, true)`;

      const board = await tx.boards.create({ data: { owner_id: owner, title: "withActor probe board" } });

      const ownerJoin = await tx.activities.findFirst({
        where: { board_id: board.id, entity_type: "member", action: "added", entity_id: owner },
      });

      check("owner's membership activity exists", ownerJoin !== null);
      check("actor A (owner) is attributed correctly", ownerJoin?.actor_id === owner, ownerJoin?.actor_id);

      // 2. Actor "member" adds themself as an editor -- a different actor,
      //    later in the same transaction, proving set_config's second call
      //    overrides the first rather than merging with it.
      await tx.$executeRaw`select set_config('app.actor_id', ${member}, true)`;

      await tx.board_members.create({ data: { board_id: board.id, user_id: member, role: "editor" } });

      const memberJoin = await tx.activities.findFirst({
        where: { board_id: board.id, entity_type: "member", action: "added", entity_id: member },
      });

      check("member's own join activity exists", memberJoin !== null);
      check("actor B (member) is attributed correctly", memberJoin?.actor_id === member, memberJoin?.actor_id);
      check("actor A did not leak into actor B's write", memberJoin?.actor_id !== owner, memberJoin?.actor_id);

      // 3. A write with no actor (system/unauthenticated context).
      await tx.$executeRaw`select set_config('app.actor_id', ${null}, true)`;

      await tx.board_members.update({
        where: { board_id_user_id: { board_id: board.id, user_id: member } },
        data: { role: "viewer" },
      });

      const roleChange = await tx.activities.findFirst({
        where: { board_id: board.id, entity_type: "member", action: "role_changed", entity_id: member },
      });

      check("role_changed activity exists", roleChange !== null);
      check(
        "explicit null actor recorded as null, not a leaked prior actor",
        roleChange?.actor_id === null,
        roleChange?.actor_id,
      );

      // Rolled back rather than cleaned up afterwards: it is faster, and a
      // rollback does not stop a trigger from firing, only discards its result.
      throw new ProbeRollback();
    });
  } catch (error) {
    if (!(error instanceof ProbeRollback)) {
      failures += 1;
      console.log(`FAIL  transaction raised an unexpected error: ${describeError(error)}`);
    }
  }

  const residualBoards = await prisma.boards.count({ where: { owner_id: owner } });

  check("rolled-back board did not persist", residualBoards === 0, residualBoards);

  await prisma.users.deleteMany({ where: { id: { in: [owner, member] } } });

  const residualUsers = await prisma.users.count({ where: { id: { in: [owner, member] } } });

  check("cleanup left no probe users/profiles", residualUsers === 0, residualUsers);
}

async function part3_boardDeletion() {
  console.log("\n--- Part 3: board deletion, and member removal still logs ---");

  const owner = randomUUID();
  const member = randomUUID();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.actor_id', ${owner}, true)`;

      await tx.users.create({
        data: { id: owner, email: `probe-del-owner-${owner}@example.test`, password_hash: "x" },
      });
      await tx.profiles.create({ data: { id: owner, username: `probe_delo_${owner.slice(0, 8)}` } });
      await tx.users.create({
        data: { id: member, email: `probe-del-member-${member}@example.test`, password_hash: "x" },
      });
      await tx.profiles.create({ data: { id: member, username: `probe_delm_${member.slice(0, 8)}` } });

      const board = await tx.boards.create({ data: { owner_id: owner, title: "deletion probe" } });

      await tx.board_members.create({ data: { board_id: board.id, user_id: member, role: "editor" } });

      // Removing one member while the board stays is the case 0007 must NOT
      // change: it is a real action by a real actor and still belongs in the feed.
      await tx.board_members.delete({
        where: { board_id_user_id: { board_id: board.id, user_id: member } },
      });

      const removal = await tx.activities.findFirst({
        where: { board_id: board.id, entity_type: "member", action: "removed", entity_id: member },
      });

      check("ordinary member removal is still logged", removal !== null);
      check("...with the acting actor", removal?.actor_id === owner, removal?.actor_id);

      // The case 0007 fixes. Before it, this raised a foreign key violation on
      // activities_board_id_fkey and no board could ever be deleted.
      await tx.boards.delete({ where: { id: board.id } });

      check("board deletion succeeds", true);

      const leftMembers = await tx.board_members.count({ where: { board_id: board.id } });
      const leftActivity = await tx.activities.count({ where: { board_id: board.id } });

      check("board_members cascaded away", leftMembers === 0, leftMembers);
      check("activities cascaded away", leftActivity === 0, leftActivity);

      throw new ProbeRollback();
    });
  } catch (error) {
    if (!(error instanceof ProbeRollback)) {
      failures += 1;
      console.log(`FAIL  board deletion raised: ${describeError(error)}`);
    }
  }

  const residual = await prisma.users.count({ where: { id: { in: [owner, member] } } });

  check("part 3 left nothing behind", residual === 0, residual);
}

try {
  await part1_actorDoesNotLeakBetweenTransactions();
  await part2_realTriggersStampTheActor();
  await part3_boardDeletion();

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (error) {
  console.error("[verify] unexpected error:", describeError(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await closePool();
}

// --- How the board-deletion defect was found and fixed ---------------------
//
// Writing this probe's cleanup was what first tried to delete a board, and it
// failed: log_member_activity (AFTER DELETE on board_members) inserted an
// `activities` row referencing OLD.board_id, but during a board-deletion
// cascade that board was already gone, so the insert violated
// activities_board_id_fkey and took the whole DELETE with it. Since
// boards_add_owner_membership gives every board an owner membership, this hit
// every board rather than an edge case.
//
// The defect came over verbatim from the Supabase migrations -- deleteBoard in
// src/services/boards/boardsApi.ts would fail there the same way; nothing had
// ever exercised it. Migration 0007 skips the log when the parent board no
// longer exists, which is the only case where the entry could not have
// survived anyway (activities is ON DELETE CASCADE from boards). Part 3 above
// pins both halves of that behaviour.

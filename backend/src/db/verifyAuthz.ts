// B6-09 — the authorization middleware, driven over real HTTP against the
// real schema.
//
// It builds its own small Express app rather than reusing app.ts: B6-09 asks
// for the middleware in isolation, and app.ts registers its 404 and error
// handlers at import time, so anything mounted afterwards is unreachable. The
// middleware, the error handler and the database are all the real ones.
//
// Fixtures: two boards owned by two different people, plus a viewer and an
// editor on the first. Everything is prefixed and deleted before and after.
//
// Run with: npm run db:verify-authz

import type { Server } from "node:http";

import express from "express";

import { AppError } from "../lib/errors.js";
import { closePool, describeError } from "./client.js";
import { prisma } from "./prisma.js";
import { withActor } from "./withActor.js";
import { signAccessToken } from "../lib/tokens.js";
import { boardAccess, requireBoard } from "../middleware/boardAccess.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validate } from "../middleware/validate.js";
import { provisionUser } from "../modules/users/users.service.js";
import { z } from "zod";

const PREFIX = "b6-probe-";
const DOMAIN = "@probe.invalid";

let failures = 0;

function check(label: string, pass: boolean, detail?: unknown): void {
  if (pass) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? `  (${JSON.stringify(detail)})` : ""}`);
  }
}

let baseUrl = "";

interface Res {
  status: number;
  body: Record<string, unknown>;
}

async function get(path: string, token?: string): Promise<Res> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
  const text = await response.text();

  return { status: response.status, body: text === "" ? {} : JSON.parse(text) };
}

async function post(path: string, token: string, body: unknown): Promise<Res> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();

  return { status: response.status, body: text === "" ? {} : JSON.parse(text) };
}

function buildApp() {
  const app = express();

  app.use(express.json());

  // Every shape a B7 route can take, so the resolver is exercised the way it
  // will actually be used.
  app.get("/b/:boardId", requireAuth, boardAccess(), (req, res) => {
    res.json({ board: requireBoard(req) });
  });
  app.get("/b/:boardId/editor", requireAuth, boardAccess(), requireRole("editor"), (req, res) => {
    res.json({ board: requireBoard(req) });
  });
  app.get("/b/:boardId/admin", requireAuth, boardAccess(), requireRole("admin"), (req, res) => {
    res.json({ board: requireBoard(req) });
  });
  app.get("/b/:boardId/owner", requireAuth, boardAccess(), requireRole("owner"), (req, res) => {
    res.json({ board: requireBoard(req) });
  });

  for (const param of [
    "todoId",
    "columnId",
    "sprintId",
    "commentId",
    "attachmentId",
    "inviteId",
  ]) {
    app.get(`/child/${param}/:${param}`, requireAuth, boardAccess(), (req, res) => {
      res.json({ board: requireBoard(req) });
    });
  }

  // Both ids present: the pairing must be real.
  app.get("/b/:boardId/t/:todoId", requireAuth, boardAccess(), (req, res) => {
    res.json({ board: requireBoard(req) });
  });

  // Two child ids and no :boardId — the shape that would slip past a resolver
  // that stopped at the first match.
  app.get("/two/:todoId/:commentId", requireAuth, boardAccess(), (req, res) => {
    res.json({ board: requireBoard(req) });
  });
  app.get("/b/:boardId/two/:todoId/:commentId", requireAuth, boardAccess(), (req, res) => {
    res.json({ board: requireBoard(req) });
  });

  // The upsert shape (§12.3): :todoId may name a row that does not exist
  // yet, so it is deliberately NOT resolved and :boardId carries the scope.
  app.get(
    "/b/:boardId/upsert/:todoId",
    requireAuth,
    boardAccess({ mayNotExist: "todoId" }),
    (req, res) => {
      res.json({ board: requireBoard(req) });
    },
  );

  // The same opt-in with no :boardId in the path. Skipping the child leaves
  // nothing at all to resolve, so this must fail loudly rather than authorize.
  app.get("/upsert/:todoId", requireAuth, boardAccess({ mayNotExist: "todoId" }), (_req, res) => {
    res.json({ ok: true });
  });

  // boardAccess with nothing to resolve — a wiring bug, not a client error.
  app.get("/unwired", requireAuth, boardAccess(), (_req, res) => {
    res.json({ ok: true });
  });

  app.post(
    "/validate/body",
    requireAuth,
    validate({ body: z.object({ title: z.string().trim().min(3), count: z.coerce.number() }) }),
    (req, res) => {
      res.json({ body: req.body });
    },
  );
  app.get(
    "/validate/params/:id",
    requireAuth,
    validate({ params: z.object({ id: z.uuid() }) }),
    (req, res) => {
      res.json({ params: req.params });
    },
  );
  app.get(
    "/validate/query",
    requireAuth,
    validate({ query: z.object({ limit: z.coerce.number().max(50) }) }),
    (req, res) => {
      res.json({ query: req.query });
    },
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function makeUser(name: string) {
  const id = crypto.randomUUID();
  const email = `${PREFIX}${name}${DOMAIN}`;

  await withActor(id, async (tx) => {
    await tx.users.create({ data: { id, email, password_hash: "x" } });
    await provisionUser(tx, { id, email, username: `${PREFIX.replace(/-/g, "_")}${name}` });
  });

  const board = await prisma.boards.findFirstOrThrow({
    where: { owner_id: id },
    select: { id: true },
  });

  return { id, email, boardId: board.id, token: signAccessToken(id).accessToken };
}

async function cleanUp(): Promise<number> {
  const { count } = await prisma.users.deleteMany({ where: { email: { startsWith: PREFIX } } });

  return count;
}

async function main() {
  let server: Server | undefined;

  try {
    const removed = await cleanUp();

    if (removed > 0) console.log(`(cleared ${removed} leftover probe account(s))`);

    server = await new Promise<Server>((resolve, reject) => {
      const listener = buildApp().listen(0, () => resolve(listener));

      listener.on("error", reject);
    });

    const address = server.address();

    if (address === null || typeof address === "string") throw new Error("no port");

    baseUrl = `http://127.0.0.1:${address.port}`;

    // --- fixtures -----------------------------------------------------------
    const alice = await makeUser("alice"); // owner of board A
    const mallory = await makeUser("mallory"); // owner of board B, unrelated
    const viewer = await makeUser("viewer");
    const editor = await makeUser("editor");

    await withActor(alice.id, async (tx) => {
      await tx.board_members.createMany({
        data: [
          { board_id: alice.boardId, user_id: viewer.id, role: "viewer" },
          { board_id: alice.boardId, user_id: editor.id, role: "editor" },
        ],
      });
    });

    const columnA = await prisma.columns.findFirstOrThrow({
      where: { board_id: alice.boardId },
      select: { id: true },
    });
    const todoA = await withActor(alice.id, (tx) =>
      tx.todos.create({
        data: { board_id: alice.boardId, column_id: columnA.id, title: "A" },
        select: { id: true },
      }),
    );
    const sprintA = await prisma.sprints.create({
      data: { board_id: alice.boardId, name: "S1" },
      select: { id: true },
    });
    const commentA = await prisma.comments.create({
      data: {
        board_id: alice.boardId,
        todo_id: todoA.id,
        author_id: alice.id,
        content: "hello",
      },
      select: { id: true },
    });
    const attachmentA = await prisma.attachments.create({
      data: {
        board_id: alice.boardId,
        todo_id: todoA.id,
        uploader_id: alice.id,
        filename: "f.png",
        storage_path: `${alice.boardId}/${todoA.id}/probe.png`,
        size_bytes: 1,
        mime_type: "image/png",
      },
      select: { id: true },
    });

    const inviteA = await withActor(alice.id, (tx) =>
      tx.board_invites.create({
        data: {
          board_id: alice.boardId,
          token_hash: `probe-a-${crypto.randomUUID()}`,
          role: "viewer",
          expires_at: new Date(Date.now() + 86_400_000),
          created_by: alice.id,
        },
        select: { id: true },
      }),
    );

    const columnB = await prisma.columns.findFirstOrThrow({
      where: { board_id: mallory.boardId },
      select: { id: true },
    });
    const todoB = await withActor(mallory.id, (tx) =>
      tx.todos.create({
        data: { board_id: mallory.boardId, column_id: columnB.id, title: "B" },
        select: { id: true },
      }),
    );
    const commentB = await prisma.comments.create({
      data: {
        board_id: mallory.boardId,
        todo_id: todoB.id,
        author_id: mallory.id,
        content: "theirs",
      },
      select: { id: true },
    });

    // --- Part 1: membership decides visibility, and 404 is the answer -------
    console.log("\n--- Part 1: non-membership is indistinguishable from non-existence ---");

    const asOwner = await get(`/b/${alice.boardId}`, alice.token);

    check("a member reaches the board", asOwner.status === 200, asOwner.body);
    check(
      "and req.board carries the resolved role",
      (asOwner.body.board as { id: string; role: string })?.role === "owner" &&
        (asOwner.body.board as { id: string }).id === alice.boardId,
      asOwner.body.board,
    );

    const asOutsider = await get(`/b/${alice.boardId}`, mallory.token);
    const noSuchBoard = await get(`/b/${crypto.randomUUID()}`, mallory.token);

    check("a non-member gets 404, not 403", asOutsider.status === 404, asOutsider.status);
    check("a board that does not exist gets 404", noSuchBoard.status === 404, noSuchBoard.status);
    check(
      "the two are byte-identical — no existence oracle",
      JSON.stringify(asOutsider.body) === JSON.stringify(noSuchBoard.body),
      { outsider: asOutsider.body, absent: noSuchBoard.body },
    );

    const malformed = await get(`/b/not-a-uuid`, mallory.token);

    check("a malformed board id gets the same 404", malformed.status === 404, malformed.status);

    const anonymous = await get(`/b/${alice.boardId}`);

    check("no token is 401, before any board lookup", anonymous.status === 401, anonymous.status);

    // --- Part 2: rank ------------------------------------------------------
    console.log("\n--- Part 2: requireRole ---");

    const viewerRead = await get(`/b/${alice.boardId}`, viewer.token);
    const viewerWrite = await get(`/b/${alice.boardId}/editor`, viewer.token);

    check("a viewer may read", viewerRead.status === 200, viewerRead.status);
    check(
      "a viewer on an editor route gets 403, not 404",
      viewerWrite.status === 403,
      viewerWrite.status,
    );
    check(
      "...because membership is already established, so the board is not a secret",
      (viewerWrite.body.error as { code: string })?.code === "forbidden",
      viewerWrite.body,
    );

    const editorWrite = await get(`/b/${alice.boardId}/editor`, editor.token);
    const editorAdmin = await get(`/b/${alice.boardId}/admin`, editor.token);
    const ownerAdmin = await get(`/b/${alice.boardId}/admin`, alice.token);
    const ownerOwner = await get(`/b/${alice.boardId}/owner`, alice.token);
    const editorOwner = await get(`/b/${alice.boardId}/owner`, editor.token);

    check("an editor passes an editor route", editorWrite.status === 200, editorWrite.status);
    check("an editor fails an admin route", editorAdmin.status === 403, editorAdmin.status);
    check("an owner passes an admin route", ownerAdmin.status === 200, ownerAdmin.status);
    check("an owner passes an owner route", ownerOwner.status === 200, ownerOwner.status);
    check("an editor fails an owner route", editorOwner.status === 403, editorOwner.status);

    const outsiderWrite = await get(`/b/${alice.boardId}/editor`, mallory.token);

    check(
      "a non-member on an editor route still gets 404, not 403",
      outsiderWrite.status === 404,
      outsiderWrite.status,
    );

    // --- Part 3: the shared child resolver ---------------------------------
    console.log("\n--- Part 3: ids that name a child rather than a board ---");

    const children: [string, string][] = [
      ["todoId", todoA.id],
      ["columnId", columnA.id],
      ["sprintId", sprintA.id],
      ["commentId", commentA.id],
      ["attachmentId", attachmentA.id],
      ["inviteId", inviteA.id],
    ];

    for (const [param, id] of children) {
      const mine = await get(`/child/${param}/${id}`, alice.token);
      const theirs = await get(`/child/${param}/${id}`, mallory.token);

      check(
        `:${param} resolves to its board for a member`,
        mine.status === 200 && (mine.body.board as { id: string })?.id === alice.boardId,
        { status: mine.status, board: mine.body.board },
      );
      check(`:${param} is 404 for an outsider`, theirs.status === 404, theirs.status);
    }

    const absentChild = await get(`/child/todoId/${crypto.randomUUID()}`, alice.token);

    check("a child id that does not exist is 404", absentChild.status === 404, absentChild.status);

    // The B6-09 case that matters most: a real id from someone else's board.
    const foreignTodo = await get(`/child/todoId/${todoB.id}`, alice.token);

    check(
      "a real todo id from another board is 404, not a leak",
      foreignTodo.status === 404,
      foreignTodo.status,
    );

    // --- Part 4: the pairing ------------------------------------------------
    console.log("\n--- Part 4: when both ids are present they must agree ---");

    const honest = await get(`/b/${alice.boardId}/t/${todoA.id}`, alice.token);
    const forged = await get(`/b/${alice.boardId}/t/${todoB.id}`, alice.token);

    check("a real pairing resolves", honest.status === 200, honest.status);
    check(
      "my board id with someone else's todo id is 404",
      forged.status === 404,
      forged.status,
    );

    // --- Part 4b: two child ids in one path --------------------------------
    console.log("\n--- Part 4b: every child id is resolved, not just the first ---");

    const bothMine = await get(`/two/${todoA.id}/${commentA.id}`, alice.token);

    check("two ids from the same board resolve", bothMine.status === 200, bothMine.status);

    // The regression this part exists for: a resolver that stopped at the
    // first match would authorize on todoA and never look at commentB.
    const smuggled = await get(`/two/${todoA.id}/${commentB.id}`, alice.token);

    check(
      "a foreign comment id smuggled beside my own todo id is 404",
      smuggled.status === 404,
      smuggled.status,
    );

    const smuggledFirst = await get(`/two/${todoB.id}/${commentA.id}`, alice.token);

    check(
      "and the same when the foreign id comes first",
      smuggledFirst.status === 404,
      smuggledFirst.status,
    );

    const tripleHonest = await get(
      `/b/${alice.boardId}/two/${todoA.id}/${commentA.id}`,
      alice.token,
    );
    const tripleForged = await get(
      `/b/${alice.boardId}/two/${todoA.id}/${commentB.id}`,
      alice.token,
    );

    check("board id plus two agreeing child ids resolves", tripleHonest.status === 200, tripleHonest.status);
    check(
      "board id plus one foreign child id is 404",
      tripleForged.status === 404,
      tripleForged.status,
    );

    // --- Part 4c: the upsert opt-in ----------------------------------------
    console.log("\n--- Part 4c: mayNotExist, for PATCH-as-upsert ---");

    const upsertAbsent = await get(
      `/b/${alice.boardId}/upsert/${crypto.randomUUID()}`,
      alice.token,
    );

    check(
      "a todo id that does not exist yet still reaches the handler",
      upsertAbsent.status === 200 &&
        (upsertAbsent.body.board as { id: string })?.id === alice.boardId,
      { status: upsertAbsent.status, board: upsertAbsent.body.board },
    );

    const upsertStrict = await get(`/child/todoId/${crypto.randomUUID()}`, alice.token);

    check(
      "...where the strict resolver on the same shape is still a 404",
      upsertStrict.status === 404,
      upsertStrict.status,
    );

    const upsertOutsider = await get(
      `/b/${alice.boardId}/upsert/${crypto.randomUUID()}`,
      mallory.token,
    );

    check(
      "membership is still checked, on :boardId",
      upsertOutsider.status === 404,
      upsertOutsider.status,
    );

    // The uncomfortable one, asserted so nobody discovers it by accident:
    // with the child skipped, a real id from another board is NOT rejected
    // here, because boardAccess never looked it up. req.board still names
    // board A, so the HANDLER is what must scope the write by
    // (id, board_id) — which is why the compound unique exists on todos.
    const upsertForeign = await get(`/b/${alice.boardId}/upsert/${todoB.id}`, alice.token);

    check(
      "a foreign todo id is NOT filtered here — the handler owns that scoping",
      upsertForeign.status === 200 &&
        (upsertForeign.body.board as { id: string })?.id === alice.boardId,
      { status: upsertForeign.status, board: upsertForeign.body.board },
    );

    const upsertUnwired = await get(`/upsert/${crypto.randomUUID()}`, alice.token);

    check(
      "the opt-in without :boardId is a 500 — nothing left to resolve",
      upsertUnwired.status === 500,
      upsertUnwired.status,
    );

    // --- Part 5: wiring mistakes fail loudly --------------------------------
    console.log("\n--- Part 5: a route behind boardAccess with nothing to resolve ---");

    const unwired = await get("/unwired", alice.token);

    check(
      "it is a 500, not a silently-allowed request",
      unwired.status === 500,
      unwired.status,
    );
    check(
      "and it does not read as 404, which would hide the bug",
      unwired.status !== 404,
      unwired.status,
    );

    // --- Part 6: validate ---------------------------------------------------
    console.log("\n--- Part 6: validate ---");

    const badBody = await post("/validate/body", alice.token, { title: "no", count: "7" });
    const goodBody = await post("/validate/body", alice.token, { title: "  hello  ", count: "7" });

    check("a bad body is 400", badBody.status === 400, badBody.status);
    check(
      "and the message names the field, not the value",
      /^title:/.test(String((badBody.body.error as { message?: string })?.message)) &&
        !JSON.stringify(badBody.body).includes("no"),
      badBody.body,
    );
    check(
      "a good body reaches the handler already parsed",
      goodBody.status === 200 &&
        (goodBody.body.body as { title: string; count: number })?.title === "hello" &&
        (goodBody.body.body as { count: number })?.count === 7,
      goodBody.body,
    );

    const badParam = await get("/validate/params/not-a-uuid", alice.token);
    const goodParam = await get(`/validate/params/${alice.boardId}`, alice.token);

    check("a bad path param is 400", badParam.status === 400, badParam.status);
    check(
      "through the same error shape as every other failure",
      (badParam.body.error as { code?: string })?.code === "bad_request" &&
        /^id:/.test(String((badParam.body.error as { message?: string })?.message)),
      badParam.body,
    );
    check(
      "a good path param reaches the handler",
      goodParam.status === 200 &&
        (goodParam.body.params as { id: string })?.id === alice.boardId,
      goodParam.body,
    );

    const badQuery = await get("/validate/query?limit=500", alice.token);
    const goodQuery = await get("/validate/query?limit=10", alice.token);

    check("a bad query is 400", badQuery.status === 400, badQuery.status);
    check(
      "a good query is coerced in place",
      goodQuery.status === 200 && (goodQuery.body.query as { limit: number })?.limit === 10,
      goodQuery.body,
    );

    // --- Part 7: accessibleBoardIds ----------------------------------------
    console.log("\n--- Part 7: accessibleBoardIds, the single swap point ---");

    const { accessibleBoardIds } = await import("../modules/boards/boards.repo.js");

    const aliceBoards = await accessibleBoardIds({ id: alice.id });
    const viewerBoards = await accessibleBoardIds({ id: viewer.id });
    const strangerBoards = await accessibleBoardIds({ id: crypto.randomUUID() });

    check("an owner sees their own board", aliceBoards.includes(alice.boardId), aliceBoards.length);
    check("and not someone else's", !aliceBoards.includes(mallory.boardId), aliceBoards.length);
    check(
      "a viewer sees the board they were added to, plus their own",
      viewerBoards.includes(alice.boardId) && viewerBoards.includes(viewer.boardId),
      viewerBoards.length,
    );
    check("an unknown actor sees nothing", strangerBoards.length === 0, strangerBoards.length);

    // --- Part 8: forgetting a middleware must never grant access -----------
    console.log("\n--- Part 8: wiring mistakes and forged roles fail closed ---");

    // Driven in process rather than over HTTP: a forged role cannot be put in
    // the database at all, because board_members_role_check refuses it.
    const runMiddleware = (
      middleware: (req: never, res: never, next: (err?: unknown) => void) => unknown,
      request: Record<string, unknown>,
    ) =>
      new Promise<{ status?: number; code?: string; passed?: true }>((resolve) => {
        const result = middleware(request as never, {} as never, (err?: unknown) =>
          resolve(
            err === undefined
              ? { passed: true }
              : { status: (err as AppError).status, code: (err as AppError).code },
          ),
        );

        if (result instanceof Promise) void result.catch(() => undefined);
      });

    const roleWithoutBoard = await runMiddleware(requireRole("viewer"), { params: {} });

    check(
      "requireRole without boardAccess is a 500, never a pass",
      roleWithoutBoard.status === 500 && roleWithoutBoard.passed === undefined,
      roleWithoutBoard,
    );

    const accessWithoutAuth = await runMiddleware(boardAccess(), {
      params: { boardId: alice.boardId },
    });

    check(
      "boardAccess without requireAuth is a 500, never a pass",
      accessWithoutAuth.status === 500 && accessWithoutAuth.passed === undefined,
      accessWithoutAuth,
    );

    const forgedRole = await runMiddleware(requireRole("viewer"), {
      params: {},
      board: { id: alice.boardId, role: "superuser" },
    });

    check("a role outside the matrix is refused, not ranked", forgedRole.status === 403, forgedRole);

    const realRole = await runMiddleware(requireRole("viewer"), {
      params: {},
      board: { id: alice.boardId, role: "owner" },
    });

    check("and a real role still passes", realRole.passed === true, realRole);
  } catch (error) {
    failures += 1;
    console.error(`\nERROR  ${describeError(error)}`);
    console.error(error);
  } finally {
    const removed = await cleanUp().catch(() => -1);

    console.log(`\n(cleaned up ${removed} probe account(s))`);

    server?.close();
    await prisma.$disconnect();
    await closePool();
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

// B4-06 verification — the SQLSTATE mapping and the HTTP error shape.
//
// Part 1 drives real constraint and trigger violations through Prisma and
// asserts what toAppError() makes of them. Mocked error objects would pass
// even if the real driver reported a different shape, which is exactly the
// bug this needs to catch -- Prisma 7 hides the SQLSTATE several levels down
// in meta.driverAdapterError.cause.originalCode.
//
// Part 2 starts the real app on an ephemeral port and checks the wire format.
//
// Every write happens inside a transaction that is always rolled back.
//
// Run with: npm run db:verify-errors

import type { Server } from "node:http";

import { app } from "../app.js";
import { closePool, describeError } from "./client.js";
import { AppError, toAppError } from "../lib/errors.js";
import { prisma } from "./prisma.js";

let failures = 0;

function check(label: string, pass: boolean, detail?: unknown): void {
  if (pass) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`);
  }
}

class Rollback extends Error {}

// Runs `attempt` inside a transaction that never commits and returns whatever
// it threw, so the caller can assert how that error is classified.
async function captureError(
  attempt: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<unknown>,
): Promise<unknown> {
  let captured: unknown;

  try {
    await prisma.$transaction(async (tx) => {
      try {
        await attempt(tx);
      } catch (error) {
        captured = error;
      }

      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) captured = error;
  }

  return captured;
}

function expect(label: string, error: unknown, code: AppError["code"], status: number): void {
  const mapped = toAppError(error);

  check(
    `${label} -> ${status} ${code}`,
    mapped.code === code && mapped.status === status,
    { got: `${mapped.status} ${mapped.code}`, from: (error as { code?: string })?.code },
  );
}

const uuid = (n: number) => `aaaaaaaa-bbbb-cccc-dddd-${String(n).padStart(12, "0")}`;

async function part1_sqlStateMapping() {
  console.log("\n--- Part 1: real database errors -> HTTP status ---");

  expect(
    "unique violation (duplicate email)",
    await captureError(async (tx) => {
      await tx.users.create({ data: { id: uuid(1), email: "dup@example.test", password_hash: "h" } });
      await tx.users.create({ data: { id: uuid(2), email: "dup@example.test", password_hash: "h" } });
    }),
    "conflict",
    409,
  );

  expect(
    "foreign key violation (board with no such owner)",
    await captureError((tx) => tx.boards.create({ data: { owner_id: uuid(9), title: "x" } })),
    "conflict",
    409,
  );

  expect(
    "check violation (profiles_username_shape)",
    await captureError(async (tx) => {
      await tx.users.create({ data: { id: uuid(3), email: "shape@example.test", password_hash: "h" } });
      await tx.profiles.create({ data: { id: uuid(3), username: "Not A Username" } });
    }),
    "bad_request",
    400,
  );

  expect(
    "not-null violation",
    await captureError(
      (tx) => tx.$executeRaw`insert into users (email, password_hash) values ('nn@example.test', null)`,
    ),
    "bad_request",
    400,
  );

  expect(
    "malformed uuid",
    await captureError((tx) => tx.$executeRaw`select * from boards where id = 'not-a-uuid'`),
    "bad_request",
    400,
  );

  // Every ownership/membership invariant in migration 0006 refuses with 42501.
  // Without this row a permission refusal from the database would be a 500.
  expect(
    "trigger refusal 42501 (delete an owner membership)",
    await captureError(async (tx) => {
      await tx.users.create({ data: { id: uuid(4), email: "owner@example.test", password_hash: "h" } });
      await tx.profiles.create({ data: { id: uuid(4), username: "probe_owner_errs" } });

      const board = await tx.boards.create({ data: { owner_id: uuid(4), title: "probe" } });

      await tx.board_members.delete({
        where: { board_id_user_id: { board_id: board.id, user_id: uuid(4) } },
      });
    }),
    "forbidden",
    403,
  );

  expect("an AppError passes through untouched", new AppError("not_found", "Board not found"), "not_found", 404);
  expect("an unrecognised error stays a 500", new Error("boom"), "internal", 500);

  const leaked = toAppError(new Error("secret detail about the schema"));

  check("500 message never echoes the original", leaked.message === "Internal server error", leaked.message);
}

type JsonBody = {
  status?: string;
  database?: string;
  version?: string;
  error?: { code?: string; message?: string };
};

const readJson = async (response: Response): Promise<JsonBody> =>
  (await response.json()) as JsonBody;

async function part2_httpShape() {
  console.log("\n--- Part 2: HTTP surface ---");

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    const base = `http://127.0.0.1:${port}`;

    const health = await fetch(`${base}/health`);
    const healthBody = await readJson(health);

    check("GET /health -> 200 ok/up", health.status === 200 && healthBody.database === "up", healthBody);

    const root = await fetch(`${base}/api/v1`);
    const rootBody = await readJson(root);

    check("GET /api/v1 -> 200, router is mounted", root.status === 200 && rootBody.version === "v1", rootBody);

    const missing = await fetch(`${base}/api/v1/nope`);
    const missingBody = await readJson(missing);

    check(
      "GET /api/v1/nope -> 404 { error: { code, message } }",
      missing.status === 404 && missingBody?.error?.code === "not_found" && typeof missingBody?.error?.message === "string",
      missingBody,
    );

    const outside = await fetch(`${base}/nope`);
    const outsideBody = await readJson(outside);

    check(
      "GET /nope -> same error shape outside the API prefix",
      outside.status === 404 && outsideBody?.error?.code === "not_found",
      outsideBody,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

try {
  await part1_sqlStateMapping();
  await part2_httpShape();

  // Scoped to this script's own fixtures on purpose: a broader match would
  // also count the leftover rows from the earlier withActor probe, which this
  // script did not create and cannot remove.
  const residue = await prisma.users.count({
    where: { email: { in: ["dup@example.test", "shape@example.test", "nn@example.test", "owner@example.test"] } },
  });

  check("no probe rows committed", residue === 0, residue);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (error) {
  console.error("[verify] unexpected error:", describeError(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await closePool();
}

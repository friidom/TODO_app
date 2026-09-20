import pg from "pg";

import { env } from "../config/env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // The session timezone is pinned, and it is not cosmetic: Prisma's pg
  // adapter reads a timestamptz from the session's own rendering and labels
  // the result UTC, so against a server running at +05 every timestamp the
  // API returned was five hours in the future. An activity finished at 19:45
  // arrived in the browser as 00:45 the next day, and the board feed filed it
  // under tomorrow.
  //
  // Verified on one row: raw pg gave 14:59:11Z, Prisma gave 19:59:11Z, and
  // with this option both give 14:59:11Z. Setting TZ on the Node process does
  // not help -- the offset comes from the database session, not from Node.
  //
  // Nothing else depends on the session zone: every admin aggregate names its
  // own zone with AT TIME ZONE, and now() is an instant either way.
  options: "-c timezone=UTC",
});

// an idle client erroring (server restart, network drop) emits on the pool, and
// an unhandled 'error' event would take the process down
pool.on("error", (error) => {
  console.error("[db] idle client error:", error.message);
});

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function ping(): Promise<{
  ok: true;
  version: string;
  database: string;
}> {
  const result = await pool.query<{ version: string; database: string }>(
    "select version() as version, current_database() as database",
  );

  return { ok: true, ...result.rows[0]! };
}

export async function closePool(): Promise<void> {
  await pool.end();
}

// a refused TCP connection arrives as an AggregateError whose own message is
// empty — the reason is only on the nested errors, so unwrap before reporting
export function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    const reasons = error.errors.map(describeError).filter(Boolean);

    return reasons.length > 0
      ? [...new Set(reasons)].join("; ")
      : "connection refused";
  }

  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;

    return error.message || code || error.name;
  }

  return String(error);
}

import pg from "pg";

import { env } from "../config/env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
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

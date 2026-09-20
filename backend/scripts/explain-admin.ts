import { Client } from "pg";

// Run against a database seeded by seed-benchmark.ts, once before 0015 and
// once after, so Phase E's claim about its five indexes is a measurement
// rather than an assertion.

const url = process.env.BENCHMARK_DATABASE_URL;

if (url === undefined) {
  throw new Error("BENCHMARK_DATABASE_URL is required.");
}

const COUNTABLE = `t.type <> 'Epic'
  and not exists (
    select 1 from todos parent where parent.id = t.parent_id and parent.type <> 'Epic'
  )`;

const ONE_USER = "(select id from profiles order by id limit 1)";

// Two shapes, and the distinction is the point. The per-developer queries are
// what the five indexes serve: they select a small slice by actor. The
// system-wide rollups touch every row by definition and an index cannot help
// them -- they are measured too, so the record shows where the indexes do
// nothing as well as where they do.
const QUERIES: { name: string; sql: string; table: string; windowed?: false }[] = [
  {
    name: "ONE developer's completed work",
    table: "todos",
    sql: `select count(*)::int, coalesce(sum(t.estimate), 0)::float8
            from todos t
           where t.completed_by = ${ONE_USER}
             and t.completed_at >= $1 and t.completed_at < $2
             and ${COUNTABLE}`,
  },
  {
    name: "ONE developer's activity, every board",
    table: "activities",
    sql: `select count(*)::int
            from activities a
           where a.actor_id = ${ONE_USER} and a.created_at >= $1 and a.created_at < $2`,
  },
  {
    name: "ONE developer's comments",
    table: "comments",
    sql: `select count(*)::int
            from comments c
           where c.author_id = ${ONE_USER} and c.created_at >= $1 and c.created_at < $2`,
  },
  {
    name: "ONE developer's year heatmap",
    table: "todos",
    sql: `select date_trunc('day', t.completed_at at time zone 'UTC') as day, count(*)::int
            from todos t
           where t.completed_by = ${ONE_USER}
             and t.completed_at >= $1 and t.completed_at < $2
             and ${COUNTABLE}
           group by 1`,
  },
  {
    name: "ONE developer's assigned work",
    table: "todos",
    sql: `select count(*)::int from todos t where t.assignee_id = ${ONE_USER}`,
    windowed: false,
  },
  {
    name: "the system activity feed, newest 50",
    table: "activities",
    sql: `select a.id, a.created_at, a.action, a.board_id, a.actor_id
            from activities a
           where a.created_at >= $1 and a.created_at < $2
           order by a.created_at desc, a.id desc
           limit 50`,
  },
  {
    name: "system rollup: every user at once",
    table: "todos",
    sql: `select t.completed_by, count(*)::int, coalesce(sum(t.estimate), 0)::float8
            from todos t
           where t.completed_by is not null
             and t.completed_at >= $1 and t.completed_at < $2
             and ${COUNTABLE}
           group by 1`,
  },
];

interface PlanRow {
  "QUERY PLAN": { "Execution Time": number; "Planning Time": number; Plan: { "Node Type": string } }[];
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: url });

  await client.connect();

  // A year: the widest window the six periods offer is the one an index has
  // to survive.
  const to = new Date();
  const from = new Date(to.getTime() - 366 * 86_400_000);

  console.log(`\n${process.argv[2] ?? "run"} — one-year window\n`);

  const results: { query: string; ms: number; scan: string }[] = [];

  for (const { name, sql, table, windowed } of QUERIES) {
    const params = windowed === false ? [] : [from, to];

    // Twice, keeping the second: the first pass pays for a cold shared_buffers
    // and would report the disk rather than the plan.
    for (let pass = 0; pass < 2; pass += 1) {
      const { rows } = await client.query<PlanRow>(
        `explain (analyze, buffers, format json) ${sql}`,
        params,
      );

      if (pass === 1) {
        const plan = rows[0]!["QUERY PLAN"][0]!;

        results.push({
          query: name,
          ms: Math.round(plan["Execution Time"] * 100) / 100,
          scan: describe(plan.Plan, table) || "(no scan on " + table + ")",
        });
      }
    }
  }

  console.table(results);

  await client.end();
}

// Scoped to the query's own table: the ONE_USER subquery scans profiles,
// and reporting the deepest scan node would report that every time. A Bitmap
// Heap Scan names no index -- its Bitmap Index Scan child does -- so a match
// keeps looking downward for the name.
function describe(node: Record<string, unknown>, table: string): string {
  const here = String(node["Node Type"]);
  const mine = node["Relation Name"] === table && here.includes("Scan");
  const index = node["Index Name"];

  if (mine && index !== undefined) return `${here} (${String(index)})`;

  for (const child of (node.Plans as Record<string, unknown>[] | undefined) ?? []) {
    const found = describe(child, table);

    if (found !== "") return found;
  }

  return mine ? `${here} on ${table}` : "";
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

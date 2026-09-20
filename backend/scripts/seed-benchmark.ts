import { Client } from "pg";

// A benchmark fixture, not a demo seed: it truncates, and it bypasses every
// application rule below. M34 Phase E needs an EXPLAIN at a size the planner
// makes real decisions at, and the development database holds three todos.
const USERS = 200;
const BOARDS = 50;
const COLUMNS_PER_BOARD = 4;
const TODOS = 20_000;
const COMMENTS = 20_000;
const ACTIVITIES = 100_000;
const DAYS = 365;

const url = process.env.BENCHMARK_DATABASE_URL;

if (url === undefined) {
  throw new Error("BENCHMARK_DATABASE_URL is required.");
}

const client = new Client({ connectionString: url });

async function run(label: string, sql: string): Promise<void> {
  const started = Date.now();

  await client.query(sql);

  console.log(`  ${label} — ${Date.now() - started}ms`);
}

async function main(): Promise<void> {
  await client.connect();

  const { rows } = await client.query<{ name: string }>("select current_database() as name");
  const name = rows[0]?.name;

  if (name === undefined || !name.endsWith("_bench")) {
    throw new Error(`Refusing to run: connected to "${name}", which is not a *_bench database.`);
  }

  console.log(`seeding ${name}`);

  // board_key allocation, owner membership, activity logging and the two
  // completion triggers each fire per row; 100k inserts through them is an
  // hour rather than seconds.
  for (const table of ["users", "boards", "board_members", "columns", "todos", "comments"]) {
    await client.query(`alter table ${table} disable trigger user`);
  }

  await run("truncate", `
    truncate table activities, comments, todos, columns, board_members, boards, profiles, users
      restart identity cascade
  `);

  await run("users + profiles", `
    insert into users (id, email, password_hash, org_role, seniority, created_at)
    select gen_random_uuid(),
           'bench-' || i || '@bench.invalid',
           'not-a-real-hash',
           'member',
           (array['junior', 'middle', 'senior', null])[1 + (i % 4)],
           now() - (i || ' hours')::interval
      from generate_series(1, ${USERS}) i;

    insert into profiles (id, username, full_name, created_at)
    select u.id, 'bench_' || row_number() over (order by u.created_at), 'Bench User', u.created_at
      from users u;
  `);

  await run("boards + columns + members", `
    insert into boards (id, owner_id, title, next_key, key_prefix)
    select gen_random_uuid(), pool.ids[1 + (i % array_length(pool.ids, 1))], 'Bench board ' || i, 1, 'KAN'
      from generate_series(1, ${BOARDS}) i
      cross join (select array_agg(id order by id) as ids from users) pool;

    insert into columns (id, board_id, title, category, position, rank)
    select gen_random_uuid(),
           b.id,
           (array['Backlog', 'In progress', 'Review', 'Done'])[c],
           (array['todo', 'in_progress', 'in_progress', 'done'])[c],
           c,
           c * 1024
      from boards b
      cross join generate_series(1, ${COLUMNS_PER_BOARD}) c;

    insert into board_members (board_id, user_id, role)
    select b.id, u.id, case when b.owner_id = u.id then 'owner' else 'editor' end
      from boards b
      join users u on b.owner_id = u.id or (abs(hashtext(b.id::text || u.id::text)) % 100) < 6
      on conflict do nothing;
  `);

  // With the triggers off nothing maintains this, so the fixture has to
  // satisfy Phase C's invariant by construction: completed_at is set if and
  // only if the row landed in the done column.
  await run("todos", `
    insert into todos (
      id, board_id, column_id, board_key, title, type, estimate,
      creator_id, assignee_id, completed_at, completed_by, position, rank, created_at
    )
    with pool as (
      select array_agg(c.id order by c.id) as column_ids,
             array_agg(c.board_id order by c.id) as board_ids,
             array_agg(c.category order by c.id) as categories
        from columns c
    ),
    people as (select array_agg(id order by id) as ids from users),
    picked as (
      select i,
             pool.board_ids[1 + (i % array_length(pool.column_ids, 1))] as board_id,
             pool.column_ids[1 + (i % array_length(pool.column_ids, 1))] as column_id,
             pool.categories[1 + (i % array_length(pool.column_ids, 1))] as category,
             people.ids[1 + (i % array_length(people.ids, 1))] as actor
        from generate_series(1, ${TODOS}) i
        cross join pool
        cross join people
    )
    select gen_random_uuid(),
           p.board_id,
           p.column_id,
           p.i,
           'Bench card ' || p.i,
           (array['Task', 'Bug', 'Story', 'Feature', 'Epic'])[1 + (p.i % 5)],
           case when p.i % 5 = 0 then null else ((p.i % 8) + 1) end,
           p.actor,
           p.actor,
           case when p.category = 'done' then now() - ((p.i % ${DAYS}) || ' days')::interval end,
           case when p.category = 'done' then p.actor end,
           p.i,
           p.i * 64,
           now() - ((p.i % ${DAYS}) || ' days')::interval
      from picked p;
  `);

  await run("comments", `
    insert into comments (id, board_id, todo_id, author_id, content, created_at)
    with pool as (
      select array_agg(t.id order by t.id) as todo_ids,
             array_agg(t.board_id order by t.id) as board_ids,
             array_agg(t.assignee_id order by t.id) as actors
        from todos t
    )
    select gen_random_uuid(),
           pool.board_ids[1 + (i % array_length(pool.todo_ids, 1))],
           pool.todo_ids[1 + (i % array_length(pool.todo_ids, 1))],
           pool.actors[1 + (i % array_length(pool.todo_ids, 1))],
           'Bench comment ' || i,
           now() - ((i % ${DAYS}) || ' days')::interval
      from generate_series(1, ${COMMENTS}) i
      cross join pool;
  `);

  // activities_event_valid is a CHECK over 21 (entity_type, action) pairs.
  await run("activities", `
    insert into activities (id, board_id, actor_id, entity_type, entity_id, action, payload, created_at)
    with pool as (
      select array_agg(t.id order by t.id) as todo_ids,
             array_agg(t.board_id order by t.id) as board_ids,
             array_agg(t.assignee_id order by t.id) as actors
        from todos t
    )
    select gen_random_uuid(),
           pool.board_ids[1 + (i % array_length(pool.todo_ids, 1))],
           pool.actors[1 + (i % array_length(pool.todo_ids, 1))],
           'todo',
           pool.todo_ids[1 + (i % array_length(pool.todo_ids, 1))],
           (array['created', 'moved', 'assigned', 'retitled', 'priority_changed'])[1 + (i % 5)],
           jsonb_build_object('title', 'Bench card', 'board_key', 1),
           now() - ((i % ${DAYS}) || ' days')::interval - ((i % 24) || ' hours')::interval
      from generate_series(1, ${ACTIVITIES}) i
      cross join pool;
  `);

  for (const table of ["users", "boards", "board_members", "columns", "todos", "comments"]) {
    await client.query(`alter table ${table} enable trigger user`);
  }

  // Otherwise the EXPLAIN numbers describe autovacuum's timing rather than
  // the index.
  await run("analyze", "analyze");

  const counts = await client.query<{ table_name: string; rows: string }>(`
    select 'users' as table_name, count(*)::text as rows from users
    union all select 'boards', count(*)::text from boards
    union all select 'todos', count(*)::text from todos
    union all select 'comments', count(*)::text from comments
    union all select 'activities', count(*)::text from activities
  `);

  console.table(counts.rows);

  await client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

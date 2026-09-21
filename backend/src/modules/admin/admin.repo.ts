import { query } from "../../db/client.js";

// EVERY QUERY IN THIS FILE IS DELIBERATELY NOT BOARD-SCOPED, and this is the
// only file in the project of which that is true.
// CONVENTIONS.md requires a boardId first and required on every board-scoped
// repo function, and calls that one of the two compensating controls for the
// ~30 RLS policies that no longer exist. Nothing here can obey it: the whole
// point of the admin surface is "across every board". So the control that
// stands in for it is the route gate -- requireSuperadmin on every /admin
// route, checked by admin.routes.parity.test.ts rather than remembered -- and
// the fact that these functions are reachable from nowhere else. Do not import
// them from another module.
// accessibleBoardIds is NOT widened to make this work (M34 D-3). Widening it
// would silently convert every existing board-scoped endpoint into a
// system-wide one, including the write paths behind requireRole, which is
// exactly the failure §10.7 rule 1 forbids.
// Aggregation happens here, in SQL, and figures leave -- never rows (D-10).
// At this scale that is not a performance choice; it is a privacy boundary.
// An endpoint that ships raw todos has shipped every board's card titles to
// the browser whatever the UI then chooses to render.
// Counts are cast ::int and sums ::float8 IN THE SQL. node-postgres returns
// int8 and numeric as strings, so without the casts every figure here would
// arrive as "42", serialise as a string, and sort "9" above "10". The service
// layer's toNumber rule covers Prisma's Decimal and bigint; this is the same
// hazard arriving through a different door, closed at the source.

// THE POPULATION, WRITTEN ONCE (M34 D-7).
// Subtasks are excluded because useVisibleTodos already excludes them
// everywhere via topLevelTodos(): counting a Task at 5 plus its subtasks at 2
// and 3 would report 10 points of work for 5 points of task.
// Epics are excluded because an Epic is a container and its estimate
// forecasts its children's. This deliberately differs from sprintPoints.ts,
// which includes them -- a sprint panel shows the Epic and its tasks together
// so a person can see the overlap, whereas a KPI percentage cannot be
// inspected and must not double-count.
// D-7 SPELLS THE FIRST CLAUSE AS `parent_id is null`, AND THAT IS WRONG.
// Being a subtask is structural, not a matter of having a parent: M27's rule
// is that a row under an Epic is a TASK whatever its own type says, and only
// a row under anything else is a Subtask. `parent_id is null` would therefore
// have excluded every task that belongs to an Epic -- which on a board that
// uses Epics is most of them, and the first integration test to try it
// reported zero points for eight points of finished work.
// So the clause mirrors topLevelTodos()'s isHiddenSubtask exactly: hide a row
// only when its parent exists and is not an Epic. A row with no parent stays,
// and a row under an Epic stays.
// The same clause defines the population for COUNTS as well as points, so
// "34 tasks, 89 points, 7 unestimated" all describe one set of rows and
// 34 = estimated + 7. A figure whose population differs from its neighbour's
// is the kind of number nobody can reconcile.
const COUNTABLE = `t.type <> 'Epic'
  and not exists (
    select 1 from todos parent where parent.id = t.parent_id and parent.type <> 'Epic'
  )`;

export interface SystemTotals {
  users: number;
  boards: number;
  completed_todos: number;
  completed_points: number;
  unestimated_completed: number;
  comments: number;
  activities: number;
  created_todos: number;
  open_todos: number;
}

export async function systemTotals(from: Date, to: Date): Promise<SystemTotals> {
  const { rows } = await query<SystemTotals>(
    `select
       (select count(*)::int from users where deactivated_at is null) as users,
       (select count(*)::int from boards) as boards,
       (select count(*)::int from todos t
         where t.completed_at >= $1 and t.completed_at < $2 and ${COUNTABLE}) as completed_todos,
       (select coalesce(sum(t.estimate), 0)::float8 from todos t
         where t.completed_at >= $1 and t.completed_at < $2 and ${COUNTABLE}) as completed_points,
       (select count(*)::int from todos t
         where t.completed_at >= $1 and t.completed_at < $2 and ${COUNTABLE}
           and t.estimate is null) as unestimated_completed,
       (select count(*)::int from comments c
         where c.created_at >= $1 and c.created_at < $2) as comments,
       (select count(*)::int from activities a
         where a.created_at >= $1 and a.created_at < $2) as activities,
       (select count(*)::int from todos t
         where t.created_at >= $1 and t.created_at < $2 and ${COUNTABLE}) as created_todos,
       (select count(*)::int from todos t
         where t.completed_at is null and ${COUNTABLE}) as open_todos`,
    [from, to],
  );

  return rows[0]!;
}

export interface SeriesPoint {
  bucket: string;
  completed_todos: number;
  completed_points: number;
  unestimated_completed: number;
  created_todos: number;
  comments: number;
  activities: number;
}

// One query, zero-filled by generate_series, carrying ALL FOUR factual
// metrics per bucket (E2 amendment 1): the dashboard's metric switch changes
// which series is drawn and must not refetch to do it.
// `bucket` and `zone` reach SQL as bound parameters rather than interpolated
// text. date_trunc takes its field as a text argument and AT TIME ZONE takes
// any text expression, so nothing here has to be concatenated -- and the
// values are a Zod enum and a validated IANA name besides.
function seriesQuery(source: string, filter: string): string {
  return `select date_trunc($1, ${source} at time zone $2) as bucket, ${filter}`;
}

export interface SeriesScope {
  boardId?: string;
  spaceId?: string;
  userId?: string;
}

export async function systemSeries(
  bucket: string,
  zone: string,
  from: Date,
  to: Date,
  scope: SeriesScope = {},
): Promise<SeriesPoint[]> {
  // $1..$4 are fixed; anything optional is appended, because PostgreSQL
  // refuses a bind message carrying a parameter the statement never uses.
  const params: unknown[] = [bucket, zone, from, to];

  const bind = (value: unknown): string => {
    params.push(value);

    return `$${params.length}`;
  };

  const boardParam = scope.boardId === undefined ? null : bind(scope.boardId);
  const spaceParam = scope.spaceId === undefined ? null : bind(scope.spaceId);
  const userParam = scope.userId === undefined ? null : bind(scope.userId);

  const filed = (column: string): string =>
    spaceParam === null
      ? ""
      : ` and ${column} in (select b.id from boards b where b.space_id = ${spaceParam})`;

  const board =
    (boardParam === null ? "" : ` and t.board_id = ${boardParam}`) + filed("t.board_id");
  const boardComment =
    (boardParam === null ? "" : ` and c.board_id = ${boardParam}`) + filed("c.board_id");
  const boardActivity =
    (boardParam === null ? "" : ` and a.board_id = ${boardParam}`) + filed("a.board_id");
  const user = userParam === null ? "" : ` and t.completed_by = ${userParam}`;
  const userCreated = userParam === null ? "" : ` and t.creator_id = ${userParam}`;
  const userComment = userParam === null ? "" : ` and c.author_id = ${userParam}`;
  const userActivity = userParam === null ? "" : ` and a.actor_id = ${userParam}`;

  const { rows } = await query<SeriesPoint>(
    `with buckets as (
       select generate_series(
         date_trunc($1, $3::timestamptz at time zone $2),
         date_trunc($1, $4::timestamptz at time zone $2),
         ('1 ' || $1)::interval
       ) as bucket
     ),
     done as (
       ${seriesQuery(
         "t.completed_at",
         `count(*)::int as completed_todos,
          coalesce(sum(t.estimate), 0)::float8 as completed_points,
          (count(*) filter (where t.estimate is null))::int as unestimated_completed`,
       )}
         from todos t
        where t.completed_at >= $3 and t.completed_at < $4 and ${COUNTABLE}${board}${user}
        group by 1
     ),
     made as (
       ${seriesQuery("t.created_at", "count(*)::int as created_todos")}
         from todos t
        where t.created_at >= $3 and t.created_at < $4 and ${COUNTABLE}${board}${userCreated}
        group by 1
     ),
     said as (
       ${seriesQuery("c.created_at", "count(*)::int as comments")}
         from comments c
        where c.created_at >= $3 and c.created_at < $4${boardComment}${userComment}
        group by 1
     ),
     did as (
       ${seriesQuery("a.created_at", "count(*)::int as activities")}
         from activities a
        where a.created_at >= $3 and a.created_at < $4${boardActivity}${userActivity}
        group by 1
     )
     select to_char(b.bucket, 'YYYY-MM-DD"T"HH24:MI:SS') as bucket,
            coalesce(done.completed_todos, 0) as completed_todos,
            coalesce(done.completed_points, 0) as completed_points,
            coalesce(done.unestimated_completed, 0) as unestimated_completed,
            coalesce(made.created_todos, 0) as created_todos,
            coalesce(said.comments, 0) as comments,
            coalesce(did.activities, 0) as activities
       from buckets b
       left join done on done.bucket = b.bucket
       left join made on made.bucket = b.bucket
       left join said on said.bucket = b.bucket
       left join did  on did.bucket  = b.bucket
      order by b.bucket`,
    params,
  );

  return rows;
}

export interface UserMetrics {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string;
  org_role: string;
  seniority: string | null;
  completed_todos: number;
  completed_points: number;
  unestimated_completed: number;
  comments: number;
  activities: number;
  boards: number;
  median_cycle_days: number | null;
  cycle_n: number;
  daily_points: number | null;
  weekly_points: number | null;
}

export interface UserScope {
  boardId?: string;
  spaceId?: string;
}

function userScopeOf(
  scope: UserScope,
  params: unknown[],
): { todo: string; comment: string; activity: string } {
  const bind = (value: unknown): string => {
    params.push(value);

    return `$${params.length}`;
  };

  let todo = "";
  let comment = "";
  let activity = "";

  if (scope.boardId !== undefined) {
    const board = bind(scope.boardId);

    todo += ` and t.board_id = ${board}`;
    comment += ` and c.board_id = ${board}`;
    activity += ` and a.board_id = ${board}`;
  }

  if (scope.spaceId !== undefined) {
    const space = bind(scope.spaceId);
    const filed = (column: string): string =>
      ` and ${column} in (select b.id from boards b where b.space_id = ${space})`;

    todo += filed("t.board_id");
    comment += filed("c.board_id");
    activity += filed("a.board_id");
  }

  return { todo, comment, activity };
}

function userMetricsSql(scope: UserScope, params: unknown[]): string {
  const filter = userScopeOf(scope, params);

  return `
  with done as (
    select t.completed_by as user_id,
           count(*)::int as completed_todos,
           coalesce(sum(t.estimate), 0)::float8 as completed_points,
           (count(*) filter (where t.estimate is null))::int as unestimated_completed
      from todos t
     where t.completed_by is not null
       and t.completed_at >= $1 and t.completed_at < $2
       and ${COUNTABLE}${filter.todo}
     group by 1
  ),
  -- M35. The same measurement flowDurations makes for the system, per person.
  -- started_at is null for everything older than 0016, so cycle_n is the size
  -- of what this median actually speaks for and travels beside it.
  cycle as (
    select t.completed_by as user_id,
           percentile_cont(0.5) within group (
             order by extract(epoch from (t.completed_at - t.started_at)) / 86400.0
           )::float8 as median_cycle_days,
           count(*)::int as cycle_n
      from todos t
     where t.completed_by is not null
       and t.completed_at >= $1 and t.completed_at < $2
       and t.started_at is not null
       and ${COUNTABLE}${filter.todo}
     group by 1
  ),
  said as (
    select c.author_id as user_id, count(*)::int as comments
      from comments c
     where c.created_at >= $1 and c.created_at < $2${filter.comment}
     group by 1
  ),
  did as (
    select a.actor_id as user_id, count(*)::int as activities
      from activities a
     where a.actor_id is not null and a.created_at >= $1 and a.created_at < $2${filter.activity}
     group by 1
  ),
  joined as (
    select bm.user_id, count(*)::int as boards from board_members bm group by 1
  )
  select u.id,
         p.username,
         p.full_name,
         p.avatar_url,
         u.email::text as email,
         u.org_role,
         u.seniority,
         coalesce(done.completed_todos, 0) as completed_todos,
         coalesce(done.completed_points, 0) as completed_points,
         coalesce(done.unestimated_completed, 0) as unestimated_completed,
         coalesce(said.comments, 0) as comments,
         coalesce(did.activities, 0) as activities,
         coalesce(joined.boards, 0) as boards,
         -- NOT coalesced to 0: nobody-timed is not instant, and a zero here
         -- would sort to the top of a "fastest" leaderboard.
         cycle.median_cycle_days,
         coalesce(cycle.cycle_n, 0) as cycle_n,
         k.daily_points::float8 as daily_points,
         k.weekly_points::float8 as weekly_points
    from users u
    join profiles p on p.id = u.id
    left join done   on done.user_id   = u.id
    left join cycle  on cycle.user_id  = u.id
    left join said   on said.user_id   = u.id
    left join did    on did.user_id    = u.id
    left join joined on joined.user_id = u.id
    left join kpi_targets k on k.seniority = u.seniority
   where u.deactivated_at is null`;
}

export async function userMetrics(
  from: Date,
  to: Date,
  scope: UserScope = {},
): Promise<UserMetrics[]> {
  const params: unknown[] = [from, to];
  const sql = userMetricsSql(scope, params);

  const { rows } = await query<UserMetrics>(
    `${sql} order by coalesce(done.completed_todos, 0) desc, p.username asc`,
    params,
  );

  return rows;
}

export async function userMetricsOne(
  userId: string,
  from: Date,
  to: Date,
  scope: UserScope = {},
): Promise<UserMetrics | null> {
  const params: unknown[] = [from, to];
  const sql = userMetricsSql(scope, params);

  params.push(userId);

  const { rows } = await query<UserMetrics>(`${sql} and u.id = $${params.length}`, params);

  return rows[0] ?? null;
}

export interface HeatmapCell {
  date: string;
  count: number;
}

// Completed tasks, not activity events (E2's heatmap decision). Activity is
// the densest metric and would make a cell almost never empty, which flatters
// -- the grid would read as effort rather than delivery. Completed tasks is
// the only candidate whose empty cell means exactly "nothing finished".
export async function userHeatmap(
  userId: string,
  from: Date,
  to: Date,
  zone: string,
  scope: UserScope = {},
): Promise<HeatmapCell[]> {
  const params: unknown[] = [userId, from, to, zone];
  const where = scopeOf(scope, params);

  const { rows } = await query<HeatmapCell>(
    `select to_char(date_trunc('day', t.completed_at at time zone $4), 'YYYY-MM-DD') as date,
            count(*)::int as count
       from todos t
      where t.completed_by = $1
        and t.completed_at >= $2 and t.completed_at < $3
        and ${COUNTABLE}${where}
      group by 1
      order by 1`,
    params,
  );

  return rows;
}

export interface BoardMetrics {
  id: string;
  title: string | null;
  key_prefix: string;
  owner_id: string | null;
  space_id: string | null;
  space_title: string | null;
  owner_username: string | null;
  members: number;
  todos: number;
  open_todos: number;
  completed_todos: number;
  completed_points: number;
  unestimated_completed: number;
  comments: number;
  activities: number;
  last_activity_at: Date | null;
  median_cycle_days: number | null;
}

const BOARD_METRICS = `
  select b.id,
         b.title,
         b.key_prefix,
         b.owner_id,
         b.space_id,
         sp.title as space_title,
         p.username as owner_username,
         (select count(*)::int from board_members m where m.board_id = b.id) as members,
         (select count(*)::int from todos t where t.board_id = b.id and ${COUNTABLE}) as todos,
         (select count(*)::int from todos t
           where t.board_id = b.id and t.completed_at is null and ${COUNTABLE}) as open_todos,
         (select count(*)::int from todos t
           where t.board_id = b.id and t.completed_at >= $1 and t.completed_at < $2
             and ${COUNTABLE}) as completed_todos,
         (select coalesce(sum(t.estimate), 0)::float8 from todos t
           where t.board_id = b.id and t.completed_at >= $1 and t.completed_at < $2
             and ${COUNTABLE}) as completed_points,
         (select count(*)::int from todos t
           where t.board_id = b.id and t.completed_at >= $1 and t.completed_at < $2
             and ${COUNTABLE} and t.estimate is null) as unestimated_completed,
         (select count(*)::int from comments c
           where c.board_id = b.id and c.created_at >= $1 and c.created_at < $2) as comments,
         (select count(*)::int from activities a
           where a.board_id = b.id and a.created_at >= $1 and a.created_at < $2) as activities,
         (select max(a.created_at) from activities a where a.board_id = b.id) as last_activity_at,
         -- M35. Null rather than 0 when nothing on this board was timed --
         -- the same rule the per-person figure follows, and for the same
         -- reason: a board nobody timed must not top a "fastest" ordering.
         (select percentile_cont(0.5) within group (
                   order by extract(epoch from (t.completed_at - t.started_at)) / 86400.0
                 )::float8
            from todos t
           where t.board_id = b.id
             and t.completed_at >= $1 and t.completed_at < $2
             and t.started_at is not null
             and ${COUNTABLE}) as median_cycle_days
    from boards b
    left join spaces sp on sp.id = b.space_id
    left join profiles p on p.id = b.owner_id`;

export async function boardMetrics(
  from: Date,
  to: Date,
  spaceId?: string,
): Promise<BoardMetrics[]> {
  const params: unknown[] = [from, to];

  const where = spaceId === undefined ? "" : ` where b.space_id = $${params.push(spaceId)}`;

  const { rows } = await query<BoardMetrics>(
    `${BOARD_METRICS}${where} order by completed_todos desc, b.title asc nulls last`,
    params,
  );

  return rows;
}

export async function boardMetricsOne(
  boardId: string,
  from: Date,
  to: Date,
): Promise<BoardMetrics | null> {
  const { rows } = await query<BoardMetrics>(`${BOARD_METRICS} where b.id = $3`, [
    from,
    to,
    boardId,
  ]);

  return rows[0] ?? null;
}

export interface ActivityRow {
  id: string;
  created_at: Date;
  action: string;
  entity_type: string;
  entity_id: string | null;
  board_id: string;
  board_title: string | null;
  key_prefix: string;
  actor_id: string | null;
  actor_username: string | null;
  title: string | null;
  board_key: number | null;
}

export interface ActivityFilters {
  userId?: string;
  boardId?: string;
  spaceId?: string;
  entityId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

// THE ONE ENDPOINT IN THIS FILE THAT RETURNS ROWS, and it does not reopen
// D-10. D-10 forbids shipping raw tables for the client to reduce; this is a
// bounded page of an already-rendered feed, filtered server-side, and no
// chart reads it. Two things keep it honest: the page is capped, and the
// payload is NOT returned whole -- only `title` and `board_key` are lifted
// out of it, because those are what a feed line says. The rest of a payload
// (old and new assignees, estimates, column names) is not needed to render
// the line and so does not leave the server.
export async function activityFeed(
  filters: ActivityFilters,
  limit: number,
  before?: { created_at: Date; id: string },
): Promise<ActivityRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  const bind = (value: unknown): string => {
    params.push(value);

    return `$${params.length}`;
  };

  if (filters.userId !== undefined) where.push(`a.actor_id = ${bind(filters.userId)}`);
  if (filters.boardId !== undefined) where.push(`a.board_id = ${bind(filters.boardId)}`);
  if (filters.action !== undefined) where.push(`a.action = ${bind(filters.action)}`);
  if (filters.entityId !== undefined) where.push(`a.entity_id = ${bind(filters.entityId)}`);
  if (filters.spaceId !== undefined) {
    where.push(`a.board_id in (select b2.id from boards b2 where b2.space_id = ${bind(filters.spaceId)})`);
  }
  if (filters.from !== undefined) where.push(`a.created_at >= ${bind(filters.from)}`);
  if (filters.to !== undefined) where.push(`a.created_at < ${bind(filters.to)}`);

  // Keyset, not OFFSET. A row inserted between two pages shifts every OFFSET
  // after it, so the reader sees one entry twice and another not at all --
  // the bug B7 already fixed once in the board feed. (created_at, id) is
  // unique enough to be a stable cursor and matches the order by.
  if (before !== undefined) {
    where.push(
      `(a.created_at, a.id) < (${bind(before.created_at)}::timestamptz, ${bind(before.id)}::uuid)`,
    );
  }

  const { rows } = await query<ActivityRow>(
    `select a.id,
            a.created_at,
            a.action,
            a.entity_type,
            a.entity_id,
            a.board_id,
            b.title as board_title,
            b.key_prefix,
            a.actor_id,
            p.username as actor_username,
            a.payload ->> 'title' as title,
            (a.payload ->> 'board_key')::int as board_key
       from activities a
       join boards b on b.id = a.board_id
       left join profiles p on p.id = a.actor_id
      ${where.length === 0 ? "" : `where ${where.join(" and ")}`}
      order by a.created_at desc, a.id desc
      limit ${bind(limit)}`,
    params,
  );

  return rows;
}

export interface KpiTarget {
  seniority: string;
  daily_points: number;
  weekly_points: number;
  updated_at: Date;
  updated_by: string | null;
  updated_by_username: string | null;
}

export async function kpiTargets(): Promise<KpiTarget[]> {
  const { rows } = await query<KpiTarget>(
    `select k.seniority,
            k.daily_points::float8 as daily_points,
            k.weekly_points::float8 as weekly_points,
            k.updated_at,
            k.updated_by,
            p.username as updated_by_username
       from kpi_targets k
       left join profiles p on p.id = k.updated_by
      order by k.daily_points asc`,
  );

  return rows;
}

export async function updateKpiTarget(
  seniority: string,
  daily: number,
  weekly: number,
  actorId: string,
): Promise<KpiTarget | null> {
  const { rows } = await query<{ seniority: string }>(
    `update kpi_targets
        set daily_points = $2, weekly_points = $3, updated_at = now(), updated_by = $4
      where seniority = $1
      returning seniority`,
    [seniority, daily, weekly, actorId],
  );

  if (rows.length === 0) return null;

  return (await kpiTargets()).find((target) => target.seniority === seniority) ?? null;
}

export async function setSeniority(userId: string, seniority: string | null): Promise<boolean> {
  const { rowCount } = await query(
    `update users set seniority = $2, updated_at = now()
      where id = $1 and deactivated_at is null`,
    [userId, seniority],
  );

  return (rowCount ?? 0) > 0;
}

export async function recordAudit(entry: {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: unknown;
}): Promise<void> {
  await query(
    `insert into admin_audit_log (actor_id, action, target_type, target_id, payload)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [entry.actorId, entry.action, entry.targetType, entry.targetId, JSON.stringify(entry.payload)],
  );
}

export interface AuditRow {
  id: string;
  actor_id: string;
  actor_username: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: unknown;
  created_at: Date;
}

export async function auditLog(limit: number): Promise<AuditRow[]> {
  const { rows } = await query<AuditRow>(
    `select l.id, l.actor_id, p.username as actor_username, l.action,
            l.target_type, l.target_id, l.payload, l.created_at
       from admin_audit_log l
       left join profiles p on p.id = l.actor_id
      order by l.created_at desc, l.id desc
      limit $1`,
    [limit],
  );

  return rows;
}

export interface FlowScope {
  boardId?: string;
  spaceId?: string;
}

// Not on FlowScope: credit is completed_by, open work is assignee_id, and the
// three open-work queries must not silently accept a person facet.
export interface CompletionScope extends FlowScope {
  completedBy?: string;
}

function scopeOf(scope: CompletionScope, params: unknown[]): string {
  const bind = (value: unknown): string => {
    params.push(value);

    return `$${params.length}`;
  };

  let sql = "";

  if (scope.boardId !== undefined) sql += ` and t.board_id = ${bind(scope.boardId)}`;

  if (scope.spaceId !== undefined) {
    sql += ` and t.board_id in (select b.id from boards b where b.space_id = ${bind(scope.spaceId)})`;
  }

  if (scope.completedBy !== undefined) {
    sql += ` and t.completed_by = ${bind(scope.completedBy)}`;
  }

  return sql;
}

export interface CfdRow {
  bucket: string;
  created: number;
  started: number;
  done: number;
}

export async function cumulativeFlow(
  bucket: string,
  zone: string,
  from: Date,
  to: Date,
  scope: FlowScope = {},
): Promise<CfdRow[]> {
  const params: unknown[] = [bucket, zone, from, to];
  const where = scopeOf(scope, params);

  const { rows } = await query<CfdRow>(
    `with buckets as (
       select generate_series(
         date_trunc($1, $3::timestamptz at time zone $2),
         date_trunc($1, $4::timestamptz at time zone $2),
         ('1 ' || $1)::interval
       ) as bucket
     ),
     base as (
       select
         (count(*) filter (where t.created_at < $3))::int as created,
         (count(*) filter (where t.started_at < $3))::int as started,
         (count(*) filter (where t.completed_at < $3))::int as done
         from todos t
        where ${COUNTABLE}${where}
     ),
     delta as (
       select date_trunc($1, t.created_at at time zone $2) as bucket,
              count(*)::int as created, 0 as started, 0 as done
         from todos t
        where t.created_at >= $3 and t.created_at < $4 and ${COUNTABLE}${where}
        group by 1
       union all
       select date_trunc($1, t.started_at at time zone $2), 0, count(*)::int, 0
         from todos t
        where t.started_at >= $3 and t.started_at < $4 and ${COUNTABLE}${where}
        group by 1
       union all
       select date_trunc($1, t.completed_at at time zone $2), 0, 0, count(*)::int
         from todos t
        where t.completed_at >= $3 and t.completed_at < $4 and ${COUNTABLE}${where}
        group by 1
     ),
     rolled as (
       select bucket,
              sum(created)::int as created,
              sum(started)::int as started,
              sum(done)::int as done
         from delta
        group by 1
     )
     select to_char(b.bucket, 'YYYY-MM-DD"T"HH24:MI:SS') as bucket,
            (base.created + sum(coalesce(r.created, 0)) over (order by b.bucket))::int as created,
            (base.started + sum(coalesce(r.started, 0)) over (order by b.bucket))::int as started,
            (base.done + sum(coalesce(r.done, 0)) over (order by b.bucket))::int as done
       from buckets b
       left join rolled r on r.bucket = b.bucket
       cross join base
      order by b.bucket`,
    params,
  );

  return rows;
}

export interface DurationRow {
  cycle_p50: number | null;
  cycle_p75: number | null;
  cycle_p90: number | null;
  cycle_n: number;
  cycle_unmeasured: number;
  lead_p50: number | null;
  lead_p75: number | null;
  lead_p90: number | null;
  lead_n: number;
  histogram: { bucket: number; count: number }[] | null;
}

export const DURATION_EDGES = [1, 2, 3, 5, 8, 13, 21];

export async function flowDurations(
  from: Date,
  to: Date,
  scope: CompletionScope = {},
): Promise<DurationRow> {
  const params: unknown[] = [from, to];
  const where = scopeOf(scope, params);

  const { rows } = await query<DurationRow>(
    `with pool as (
       select
         case when t.started_at is not null
              then extract(epoch from (t.completed_at - t.started_at)) / 86400.0
         end as cycle_days,
         extract(epoch from (t.completed_at - t.created_at)) / 86400.0 as lead_days
         from todos t
        where t.completed_at >= $1 and t.completed_at < $2 and ${COUNTABLE}${where}
     )
     select
       percentile_cont(0.5)  within group (order by cycle_days)::float8 as cycle_p50,
       percentile_cont(0.75) within group (order by cycle_days)::float8 as cycle_p75,
       percentile_cont(0.9)  within group (order by cycle_days)::float8 as cycle_p90,
       count(cycle_days)::int as cycle_n,
       (count(*) filter (where cycle_days is null))::int as cycle_unmeasured,
       percentile_cont(0.5)  within group (order by lead_days)::float8 as lead_p50,
       percentile_cont(0.75) within group (order by lead_days)::float8 as lead_p75,
       percentile_cont(0.9)  within group (order by lead_days)::float8 as lead_p90,
       count(lead_days)::int as lead_n,
       (select jsonb_agg(jsonb_build_object('bucket', h.bucket, 'count', h.count) order by h.bucket)
          from (select width_bucket(cycle_days, $${params.length + 1}::float8[]) as bucket,
                       count(*)::int as count
                  from pool
                 where cycle_days is not null
                 group by 1) h) as histogram
       from pool`,
    [...params, DURATION_EDGES],
  );

  return rows[0]!;
}

export interface WipRow {
  key: string;
  label: string;
  category: string;
  count: number;
}

export async function wipBreakdown(scope: FlowScope = {}): Promise<WipRow[]> {
  if (scope.boardId !== undefined) {
    const { rows } = await query<WipRow>(
      `select c.id as key,
              coalesce(nullif(btrim(c.title), ''), 'Untitled') as label,
              coalesce(c.category, 'todo') as category,
              (count(t.id) filter (where t.completed_at is null))::int as count
         from columns c
         left join todos t
           on t.column_id = c.id
          and t.completed_at is null
          and t.type <> 'Epic'
          and not exists (
            select 1 from todos parent where parent.id = t.parent_id and parent.type <> 'Epic'
          )
        where c.board_id = $1
        group by c.id, c.title, c.category, c.rank, c.position
        order by c.rank asc nulls last, c.position asc nulls last`,
      [scope.boardId],
    );

    return rows;
  }

  const params: unknown[] = [];
  const where = scopeOf(scope, params);

  const { rows } = await query<WipRow>(
    `select case when t.column_id is null then 'backlog' else coalesce(c.category, 'todo') end as key,
            '' as label,
            case when t.column_id is null then 'none' else coalesce(c.category, 'todo') end as category,
            count(*)::int as count
       from todos t
       left join columns c on c.id = t.column_id
      where t.completed_at is null and ${COUNTABLE}${where}
      group by 1, 3`,
    params,
  );

  return rows;
}

export interface AgingRow {
  bucket: number;
  count: number;
}

export const AGING_EDGES = [3, 8, 15, 31];

export async function wipAging(scope: FlowScope = {}): Promise<AgingRow[]> {
  const params: unknown[] = [];
  const where = scopeOf(scope, params);

  const { rows } = await query<AgingRow>(
    `select width_bucket(
              extract(epoch from (now() - t.started_at)) / 86400.0,
              $${params.length + 1}::float8[]
            ) as bucket,
            count(*)::int as count
       from todos t
      where t.completed_at is null
        and t.started_at is not null
        and ${COUNTABLE}${where}
      group by 1
      order by 1`,
    [...params, AGING_EDGES],
  );

  return rows;
}

export type FlowSliceBy = "estimate" | "priority" | "type";

export interface FlowSliceRow {
  key: string | null;
  count: number;
  cycle_median: number | null;
  lead_median: number | null;
}

const SLICE_KEY: Record<FlowSliceBy, string> = {
  estimate: "t.estimate::text",
  priority: "t.priority",
  type: "t.type",
};

export async function flowSlices(
  from: Date,
  to: Date,
  sliceBy: FlowSliceBy,
  scope: CompletionScope = {},
): Promise<FlowSliceRow[]> {
  const params: unknown[] = [from, to];
  const where = scopeOf(scope, params);

  const { rows } = await query<FlowSliceRow>(
    `select ${SLICE_KEY[sliceBy]} as key,
            count(*)::int as count,
            percentile_cont(0.5) within group (
              order by case when t.started_at is not null
                            then extract(epoch from (t.completed_at - t.started_at)) / 86400.0
                       end
            )::float8 as cycle_median,
            percentile_cont(0.5) within group (
              order by extract(epoch from (t.completed_at - t.created_at)) / 86400.0
            )::float8 as lead_median
       from todos t
      where t.completed_at >= $1 and t.completed_at < $2 and ${COUNTABLE}${where}
      group by 1
      order by count(*) desc, 1 asc nulls last
      limit 12`,
    params,
  );

  return rows;
}

export interface BoardShareRow {
  board_id: string;
  title: string | null;
  completed_todos: number;
  completed_points: number;
}

export async function userBoardShare(
  userId: string,
  from: Date,
  to: Date,
  scope: UserScope = {},
): Promise<BoardShareRow[]> {
  const params: unknown[] = [userId, from, to];
  const where = scopeOf(scope, params);

  const { rows } = await query<BoardShareRow>(
    `select b.id as board_id,
            b.title,
            count(*)::int as completed_todos,
            coalesce(sum(t.estimate), 0)::float8 as completed_points
       from todos t
       join boards b on b.id = t.board_id
      where t.completed_by = $1
        and t.completed_at >= $2 and t.completed_at < $3
        and ${COUNTABLE}${where}
      group by 1, 2
      order by 3 desc, 2 asc nulls last
      limit 12`,
    params,
  );

  return rows;
}

export interface RecentCompletionRow {
  id: string;
  board_id: string;
  board_title: string | null;
  key_prefix: string;
  board_key: number | null;
  title: string | null;
  completed_at: Date;
  estimate: number | null;
  cycle_days: number | null;
}

export const RECENT_COMPLETIONS = 20;

// Returns rows, not figures. Read against M34 D-10 in M35 D-22 — activities
// has no 'completed' action, so todos is the only source.
export async function userRecentCompletions(
  userId: string,
  from: Date,
  to: Date,
  limit: number = RECENT_COMPLETIONS,
  scope: UserScope = {},
): Promise<RecentCompletionRow[]> {
  const params: unknown[] = [userId, from, to, limit];
  const where = scopeOf(scope, params);

  const { rows } = await query<RecentCompletionRow>(
    `select t.id,
            t.board_id,
            b.title as board_title,
            b.key_prefix,
            t.board_key,
            t.title,
            t.completed_at,
            t.estimate::float8 as estimate,
            case when t.started_at is not null
                 then extract(epoch from (t.completed_at - t.started_at)) / 86400.0
            end::float8 as cycle_days
       from todos t
       join boards b on b.id = t.board_id
      where t.completed_by = $1
        and t.completed_at >= $2 and t.completed_at < $3
        and ${COUNTABLE}${where}
      order by t.completed_at desc, t.id desc
      limit $4`,
    params,
  );

  return rows;
}

export interface SpaceMetrics {
  id: string | null;
  title: string;
  owner_id: string | null;
  owner_username: string | null;
  boards: number;
  members: number;
  todos: number;
  open_todos: number;
  completed_todos: number;
  completed_points: number;
  unestimated_completed: number;
  comments: number;
  activities: number;
  last_activity_at: Date | null;
  median_cycle_days: number | null;
}

// `is not distinct from` and not `=`: boards.space_id is nullable, and the
// Unfiled bucket is real work that must not drop out of the rollup.
const SPACE_METRICS = `
  with per_board as (
    select b.id, b.space_id,
           (select count(*)::int from todos t where t.board_id = b.id and ${COUNTABLE}) as todos,
           (select count(*)::int from todos t
             where t.board_id = b.id and t.completed_at is null and ${COUNTABLE}) as open_todos,
           (select count(*)::int from todos t
             where t.board_id = b.id and t.completed_at >= $1 and t.completed_at < $2
               and ${COUNTABLE}) as completed_todos,
           (select coalesce(sum(t.estimate), 0)::float8 from todos t
             where t.board_id = b.id and t.completed_at >= $1 and t.completed_at < $2
               and ${COUNTABLE}) as completed_points,
           (select count(*)::int from todos t
             where t.board_id = b.id and t.completed_at >= $1 and t.completed_at < $2
               and ${COUNTABLE} and t.estimate is null) as unestimated_completed,
           (select count(*)::int from comments c
             where c.board_id = b.id and c.created_at >= $1 and c.created_at < $2) as comments,
           (select count(*)::int from activities a
             where a.board_id = b.id and a.created_at >= $1 and a.created_at < $2) as activities,
           (select max(a.created_at) from activities a where a.board_id = b.id) as last_activity_at
      from boards b
  ),
  grouped as (
    select space_id,
           count(*)::int as boards,
           sum(todos)::int as todos,
           sum(open_todos)::int as open_todos,
           sum(completed_todos)::int as completed_todos,
           sum(completed_points)::float8 as completed_points,
           sum(unestimated_completed)::int as unestimated_completed,
           sum(comments)::int as comments,
           sum(activities)::int as activities,
           max(last_activity_at) as last_activity_at
      from per_board
     group by space_id
  )
  select g.space_id as id,
         coalesce(s.title, 'Unfiled') as title,
         s.owner_id,
         p.username as owner_username,
         g.boards, g.todos, g.open_todos, g.completed_todos, g.completed_points,
         g.unestimated_completed, g.comments, g.activities, g.last_activity_at,
         (select count(distinct m.user_id)::int
            from board_members m
            join boards b2 on b2.id = m.board_id
           where b2.space_id is not distinct from g.space_id) as members,
         (select percentile_cont(0.5) within group (
                   order by extract(epoch from (t.completed_at - t.started_at)) / 86400.0
                 )::float8
            from todos t
            join boards b3 on b3.id = t.board_id
           where b3.space_id is not distinct from g.space_id
             and t.completed_at >= $1 and t.completed_at < $2
             and t.started_at is not null
             and ${COUNTABLE}) as median_cycle_days
    from grouped g
    left join spaces s on s.id = g.space_id
    left join profiles p on p.id = s.owner_id`;

export async function spaceMetrics(from: Date, to: Date): Promise<SpaceMetrics[]> {
  const { rows } = await query<SpaceMetrics>(
    `${SPACE_METRICS} order by g.completed_todos desc, coalesce(s.title, 'Unfiled') asc`,
    [from, to],
  );

  return rows;
}

export async function spaceMetricsOne(
  spaceId: string,
  from: Date,
  to: Date,
): Promise<SpaceMetrics | null> {
  const { rows } = await query<SpaceMetrics>(`${SPACE_METRICS} where g.space_id = $3`, [
    from,
    to,
    spaceId,
  ]);

  return rows[0] ?? null;
}

export interface TodoDetail {
  id: string;
  board_id: string;
  board_title: string | null;
  key_prefix: string;
  board_key: number | null;
  space_id: string | null;
  space_title: string | null;
  title: string | null;
  type: string;
  priority: string | null;
  estimate: number | null;
  column_id: string | null;
  column_title: string | null;
  category: string | null;
  assignee_id: string | null;
  assignee_username: string | null;
  completed_by: string | null;
  completed_by_username: string | null;
  creator_id: string | null;
  creator_username: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  cycle_days: number | null;
  lead_days: number | null;
}

export async function todoDetail(todoId: string): Promise<TodoDetail | null> {
  const { rows } = await query<TodoDetail>(
    `select t.id,
            t.board_id,
            b.title as board_title,
            b.key_prefix,
            t.board_key,
            b.space_id,
            s.title as space_title,
            t.title,
            t.type,
            t.priority,
            t.estimate::float8 as estimate,
            t.column_id,
            c.title as column_title,
            c.category,
            t.assignee_id,
            ap.username as assignee_username,
            t.completed_by,
            cp.username as completed_by_username,
            t.creator_id,
            rp.username as creator_username,
            t.created_at,
            t.started_at,
            t.completed_at,
            (case when t.started_at is not null and t.completed_at is not null
                  then extract(epoch from (t.completed_at - t.started_at)) / 86400.0
             end)::float8 as cycle_days,
            (case when t.completed_at is not null
                  then extract(epoch from (t.completed_at - t.created_at)) / 86400.0
             end)::float8 as lead_days
       from todos t
       join boards b on b.id = t.board_id
       left join spaces s on s.id = b.space_id
       left join columns c on c.id = t.column_id
       left join profiles ap on ap.id = t.assignee_id
       left join profiles cp on cp.id = t.completed_by
       left join profiles rp on rp.id = t.creator_id
      where t.id = $1`,
    [todoId],
  );

  return rows[0] ?? null;
}

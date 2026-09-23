import { randomUUID } from "node:crypto";

import "dotenv/config";
import { Client } from "pg";

import { hashPassword } from "../src/lib/password.js";

// Development-only demo data. It writes through the real schema -- same
// tables, same constraints, same invariants -- so what the UI renders is what
// the application would really hold.
//
// It is additive and idempotent: it deletes ONLY the accounts it created
// (everything at DEMO_DOMAIN, plus the demo superadmin) and lets the existing
// cascades take their boards, todos, comments and activity with them. An
// account you made by hand is left alone, and running it twice does not
// double the data.
//
//   npm run db:seed-demo -- --confirm
const DEMO_DOMAIN = "veylo.demo";
const DEMO_SUPERADMIN = "superadmin@gmail.com";
const DEMO_PASSWORD = "123123123123";

const USERS = 38;
const TODOS_PER_BOARD = 110;

// Fixed, so two runs produce the same organisation and a bug found in one run
// is still there in the next.
const SEED = 0x5eed_1234;

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(SEED);

const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]!;
const between = (low: number, high: number): number => low + Math.floor(rnd() * (high - low + 1));
const chance = (probability: number): boolean => rnd() < probability;

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));

    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }

  return copy;
}

const FIRST = [
  "Aisha", "Marcus", "Lena", "Tomas", "Priya", "Elena", "Jonas", "Nadia", "Caleb", "Ingrid",
  "Rashid", "Mira", "Oskar", "Yuki", "Diego", "Anja", "Samir", "Freya", "Hugo", "Leila",
  "Viktor", "Noor", "Emil", "Sofia", "Ruben", "Zara", "Anton", "Maya", "Felix", "Inès",
  "Kwame", "Hanna", "Otto", "Amara", "Levi", "Sena", "Dmitri", "Clara",
] as const;

const LAST = [
  "Karimova", "Bergstrom", "Nowak", "Vasquez", "Oyelaran", "Lindqvist", "Ferreira", "Haddad",
  "Whitfield", "Sorensen", "Petrov", "Nakamura", "Oduya", "Marchetti", "Delacroix", "Kovacs",
  "Rahman", "Andersen", "Mbeki", "Tanaka", "Silva", "Novak", "Eriksen", "Chowdhury",
  "Moreau", "Aliyev", "Sandberg", "Okonkwo", "Rossi", "Vogel", "Dubois", "Hartman",
  "Ilyushin", "Bauer", "Costa", "Larsen", "Grimaldi", "Tashkentov",
] as const;

const SPACES = [
  "Platform", "Mobile", "Growth", "Data & Analytics", "Customer Success", "Design System",
] as const;

interface BoardSeed {
  title: string;
  space: (typeof SPACES)[number];
  theme: keyof typeof TITLES;
}

const BOARDS: BoardSeed[] = [
  { title: "Core API", space: "Platform", theme: "backend" },
  { title: "Authentication & Identity", space: "Platform", theme: "backend" },
  { title: "Infrastructure", space: "Platform", theme: "infra" },
  { title: "Billing", space: "Platform", theme: "backend" },
  { title: "iOS App", space: "Mobile", theme: "mobile" },
  { title: "Android App", space: "Mobile", theme: "mobile" },
  { title: "Onboarding Funnel", space: "Growth", theme: "growth" },
  { title: "Lifecycle Email", space: "Growth", theme: "growth" },
  { title: "Reporting Pipeline", space: "Data & Analytics", theme: "data" },
  { title: "Experimentation", space: "Data & Analytics", theme: "data" },
  { title: "Support Tooling", space: "Customer Success", theme: "support" },
  { title: "Escalations", space: "Customer Success", theme: "support" },
  { title: "Component Library", space: "Design System", theme: "design" },
  { title: "Design Tokens", space: "Design System", theme: "design" },
];

const TITLES = {
  backend: [
    "Rate limit the public search endpoint", "Return 409 instead of 500 on duplicate invite",
    "Paginate the activity feed with a keyset cursor", "Move token rotation behind a mutex",
    "Add composite index on (board_id, created_at)", "Reject malformed UUIDs before the query",
    "Cache board membership for the request lifetime", "Retry idempotent writes on serialization failure",
    "Split the user service from the auth service", "Log slow queries above 200ms",
    "Drop the unused legacy webhook table", "Validate estimate against the CHECK constraint",
    "Stamp completed_at from the column category", "Backfill missing board keys",
    "Refuse cross-board parent references", "Emit a realtime event on column reorder",
  ],
  infra: [
    "Pin the Postgres image to 18.2", "Add a healthcheck to the backend container",
    "Rotate the JWT signing secret", "Move nginx config out of the image",
    "Set up nightly logical backups", "Alert when connection pool saturation exceeds 80%",
    "Reduce the frontend image to a distroless base", "Cache npm install between CI runs",
    "Terminate TLS at the proxy", "Add a readiness probe separate from liveness",
    "Bound the pg pool to 10 connections", "Ship container logs to a single stream",
  ],
  mobile: [
    "Offline queue for card moves", "Fix keyboard covering the comment box",
    "Respect the system dark mode setting", "Reduce cold start below 1.2s",
    "Handle a 401 during background refresh", "Swipe to change column",
    "Crash on rotating the board view", "Prefetch avatars on the board list",
    "Badge count out of sync after logout", "Deep link into a single card",
    "Haptic feedback on drop", "Shrink the release bundle below 30MB",
  ],
  growth: [
    "A/B test the empty board state", "Shorten signup to a single screen",
    "Send a nudge after three idle days", "Track activation as first card completed",
    "Reduce invite email bounce rate", "Add a sample board for new accounts",
    "Explain spaces on first run", "Measure time to first board",
    "Stop emailing deactivated accounts", "Localise the welcome sequence",
  ],
  data: [
    "Define completed points once, in SQL", "Nightly rollup of per-developer metrics",
    "Fix the quarter-to-date boundary", "Separate rolling 3m from calendar quarter",
    "Exclude Epics from the points rollup", "Report unestimated work as its own figure",
    "Bucket activity in a single timezone", "Detect double-counted subtasks",
    "Chart completion trend by week", "Warn when a target has never been set",
  ],
  support: [
    "Surface the board key in every ticket", "Merge duplicate escalations",
    "Auto-close tickets idle for 30 days", "Template the first response",
    "Route billing questions to Finance", "Show the customer's plan on the card",
    "Track first-response time", "Escalate after two reopens",
    "Bulk reassign on rota change", "Attach the failing request id",
  ],
  design: [
    "Unify button heights across the app", "One radius scale, three sizes",
    "Audit contrast in dark mode", "Replace ad-hoc separators with spacing",
    "Document the empty state pattern", "Consistent modal padding",
    "Focus ring on every interactive element", "Remove the second card style",
    "Define density tokens", "Align icon sizes to a 4px grid",
  ],
} as const;

const EPIC_TITLES = [
  "Realtime collaboration", "Reporting and KPI", "Account security hardening",
  "Mobile parity", "Self-serve onboarding", "Performance budget",
  "Design system v2", "Billing and plans", "Search and filtering", "Accessibility pass",
] as const;

const SUBTASKS = [
  "Write the migration", "Add the integration test", "Update the API docs",
  "Handle the error path", "Review with design", "Measure before and after",
  "Add a feature flag", "Roll out to staging", "Backfill existing rows",
] as const;

const COMMENTS = [
  "Reproduced on staging — same stack trace.", "Splitting this out, it is two changes.",
  "Blocked until the migration lands.", "Nice, this also fixes the flaky test.",
  "Can we cover the null case as well?", "Moved to next sprint, no capacity this week.",
  "The estimate looks low for the migration part.", "Agreed. Let us do the smaller version first.",
  "I will take this after the review.", "Confirmed fixed on 2.4.1.",
  "This overlaps with the epic above.", "Left a couple of notes on the PR.",
  "Deployed. Watching the error rate.", "Rolling back — latency regression.",
  "Docs updated, ready for another look.", "Closing, superseded by the newer card.",
] as const;

const TYPES = ["Task", "Bug", "Story", "Feature"] as const;
const PRIORITIES = ["lowest", "low", "medium", "high", "highest"] as const;
const ESTIMATES = [1, 2, 3, 5, 8, 13] as const;
const SENIORITIES = ["junior", "middle", "senior", null] as const;

const COLUMN_SETS = [
  [
    ["Backlog", "todo"], ["To do", "todo"], ["In progress", "in_progress"],
    ["In review", "in_review"], ["Done", "done"],
  ],
  [
    ["Triage", "todo"], ["Ready", "todo"], ["Building", "in_progress"],
    ["Verifying", "in_progress"], ["Shipped", "done"],
  ],
  [
    ["Inbox", "todo"], ["This week", "todo"], ["Doing", "in_progress"], ["Done", "done"],
  ],
] as const;

const ACTIONS = [
  "created", "moved", "assigned", "retitled", "priority_changed",
  "due_changed", "estimate_changed", "description_changed",
] as const;

const DAY = 86_400_000;

// Denser recently than a year ago, because a real board is. The exponent is
// what bends it: a flat distribution would make every period look the same,
// and "is this going up or down" would have no answer.
function daysAgoWeighted(maxDays: number): number {
  return Math.floor(Math.pow(rnd(), 2.1) * maxDays);
}

function at(daysAgo: number, now: number): Date {
  const jitterHours = between(8, 19);
  const day = new Date(now - daysAgo * DAY);

  day.setHours(jitterHours, between(0, 59), between(0, 59), 0);

  return day;
}

interface SeedUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  orgRole: string;
  seniority: string | null;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;

  if (url === undefined) throw new Error("DATABASE_URL is required.");

  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data with NODE_ENV=production.");
  }

  if (!process.argv.includes("--confirm") && process.env.DEMO_SEED_CONFIRM !== "yes") {
    throw new Error("Refusing to run without --confirm (or DEMO_SEED_CONFIRM=yes).");
  }

  const client = new Client({ connectionString: url });

  await client.connect();

  const { rows } = await client.query<{ name: string }>("select current_database() as name");
  const database = rows[0]!.name;

  // *_test belongs to the integration suite and *_bench to seed-benchmark;
  // dropping demo accounts into either would make their failures mystifying.
  if (database.endsWith("_test") || database.endsWith("_bench")) {
    throw new Error(`Refusing to seed demo data into "${database}".`);
  }

  console.log(`seeding demo data into ${database}`);

  const now = Date.now();
  const hash = await hashPassword(DEMO_PASSWORD);

  const people: SeedUser[] = [];
  const takenNames = new Set<string>();

  for (let i = 0; i < USERS; i += 1) {
    const first = FIRST[i % FIRST.length]!;
    const last = LAST[(i * 7 + 3) % LAST.length]!;

    // profiles_username_shape is ^[a-z0-9][a-z0-9_]{2,29}$ -- no dots, and the
    // diacritics in the name pool have to be folded away before they are cut.
    let username = `${first}_${last}`
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 28);

    while (takenNames.has(username)) username = `${username}${i}`;

    takenNames.add(username);

    people.push({
      id: randomUUID(),
      email: `${username}@${DEMO_DOMAIN}`,
      username,
      fullName: `${first} ${last}`,
      // Two elevated roles that do nothing yet, so the column holds more than
      // one value and a listing that assumed otherwise shows up.
      orgRole: i === 1 ? "team_lead" : i === 2 ? "director" : "member",
      seniority: pick(SENIORITIES),
    });
  }

  const admin: SeedUser = {
    id: randomUUID(),
    email: DEMO_SUPERADMIN,
    username: "superadmin",
    fullName: "Ops Admin",
    orgRole: "superadmin",
    seniority: "senior",
  };

  const everyone = [admin, ...people];

  await client.query("begin");

  try {
    // Cleanup runs BEFORE the triggers come off, and in dependency order.
    //
    // Deleting a profile does two things to the same todo: it SETs NULL on
    // creator_id/assignee_id, and it CASCADEs away any board that profile
    // owns. When the board goes first, the SET NULL update re-checks
    // todos_board_id_fkey against a board that is already gone and the whole
    // delete is refused. Removing the boards explicitly first leaves the
    // account delete with nothing left to interleave.
    const demo = `(select id from users where email like $1 or email = $2)`;

    const args = [`%@${DEMO_DOMAIN}`, DEMO_SUPERADMIN];

    await client.query(`delete from boards where owner_id in ${demo}`, args);
    await client.query(`delete from spaces where owner_id in ${demo}`, args);

    const removed = await client.query(
      `delete from users where email like $1 or email = $2`,
      args,
    );

    console.log(`  removed ${removed.rowCount ?? 0} previous demo account(s)`);

    for (const table of ["users", "boards", "board_members", "columns", "todos", "comments", "sprints", "spaces"]) {
      await client.query(`alter table ${table} disable trigger user`);
    }

    for (const person of everyone) {
      const createdAt = at(daysAgoWeighted(400) + 30, now);

      await client.query(
        `insert into users (id, email, password_hash, email_verified_at, org_role, seniority, created_at, updated_at)
         values ($1, $2, $3, $7, $4, $5, $6, $6)`,
        [person.id, person.email, hash, person.orgRole, person.seniority, createdAt, createdAt],
      );

      await client.query(
        `insert into profiles (id, username, full_name, email, created_at) values ($1, $2, $3, $4, $5)`,
        [person.id, person.username, person.fullName, person.email, createdAt],
      );
    }

    console.log(`  ${everyone.length} people`);

    // A board's owner must own the space it is filed into -- that is what
    // boards_space_ownership enforces, and what makes the space visible in
    // that person's sidebar. Assigning the two independently produced a tree
    // where every board read as "Unfiled" to everybody.
    //
    // The demo superadmin owns the first space so the account you sign in
    // with has a real workspace of its own, and is still a stranger to the
    // other twelve boards, which is what the admin area is for.
    const spaceIds = new Map<string, string>();
    const spaceOwners = new Map<string, SeedUser>();
    const owners = shuffled(people);

    for (const [index, title] of SPACES.entries()) {
      const id = randomUUID();
      const owner = index === 0 ? admin : owners[index % owners.length]!;

      await client.query(
        `insert into spaces (id, owner_id, title, created_at, updated_at) values ($1, $2, $3, $4, $4)`,
        [id, owner.id, title, at(300, now)],
      );

      spaceIds.set(title, id);
      spaceOwners.set(title, owner);
    }

    let todoRows = 0;
    let commentRows = 0;
    let activityRows = 0;

    for (const board of BOARDS) {
      const boardId = randomUUID();
      const owner = spaceOwners.get(board.space)!;
      const created = at(between(240, 340), now);

      await client.query(
        `insert into boards (id, owner_id, space_id, title, description, next_key, key_prefix, visibility, created_at, updated_at)
         values ($1, $2, $3, $4, $5, 1, 'KAN', 'private', $6, $6)`,
        [boardId, owner.id, spaceIds.get(board.space), board.title, `Work for ${board.title}.`, created],
      );

      const members = shuffled(people).slice(0, between(5, 11));

      if (!members.some((person) => person.id === owner.id)) members.unshift(owner);

      await client.query(
        `insert into board_members (board_id, user_id, role, joined_at) values ($1, $2, 'owner', $3)`,
        [boardId, owner.id, created],
      );

      for (const person of members) {
        if (person.id === owner.id) continue;

        await client.query(
          `insert into board_members (board_id, user_id, role, joined_at) values ($1, $2, $3, $4)
           on conflict do nothing`,
          [boardId, person.id, chance(0.15) ? "admin" : chance(0.75) ? "editor" : "viewer", created],
        );
      }

      const columnSet = COLUMN_SETS[BOARDS.indexOf(board) % COLUMN_SETS.length]!;
      const columns: { id: string; category: string }[] = [];

      for (const [index, [title, category]] of columnSet.entries()) {
        const id = randomUUID();

        await client.query(
          `insert into columns (id, board_id, title, category, position, rank, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $7)`,
          [id, boardId, title, category, index, (index + 1) * 1024, created],
        );

        columns.push({ id, category });
      }

      const doneColumn = columns.find((column) => column.category === "done")!;

      const sprints: string[] = [];

      for (let s = 0; s < 4; s += 1) {
        const id = randomUUID();
        const state = s === 3 ? "active" : "completed";
        const start = at(60 - s * 14, now);
        const end = at(46 - s * 14, now);

        await client.query(
          `insert into sprints (id, board_id, name, goal, start_date, end_date, state, rank, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
          [id, boardId, `Sprint ${28 + s}`, `Ship ${board.title} improvements.`, start, end, state, (s + 1) * 1024, start],
        );

        sprints.push(id);
      }

      const titles = TITLES[board.theme];
      const epicIds: string[] = [];
      let boardKey = 1;

      const insertTodo = async (input: {
        title: string;
        type: string;
        parentId: string | null;
        columnIndex: number;
        sprintId: string | null;
      }): Promise<{
        id: string;
        key: number;
        title: string;
        createdAt: Date;
        assignee: SeedUser | null;
      }> => {
        const id = randomUUID();
        const column = columns[input.columnIndex]!;
        const isDone = column.category === "done";

        // A weighted age for done work, and a shallower one for open work:
        // open cards nobody has touched in a year are not what a live board
        // looks like.
        const ageDays = isDone ? daysAgoWeighted(380) : daysAgoWeighted(120);
        const createdAt = at(Math.min(ageDays + between(2, 30), 395), now);
        const completedAt = isDone ? at(ageDays, now) : null;

        const startedAt = ((): Date | null => {
          if ((column.category ?? "todo") === "todo") return null;
          if (isDone && ageDays > 250) return null;

          const from = createdAt.getTime();
          const to = (completedAt ?? new Date(now)).getTime();

          if (to <= from) return createdAt;

          return new Date(from + Math.pow(rnd(), 0.8) * (to - from));
        })();

        // A fifth of people are unassigned, so "nobody's KPI" is represented.
        const assignee = chance(0.8) ? pick(members) : null;

        // 25% unestimated, which is what makes the unestimated figure beside
        // every points total mean something.
        const estimate = input.type === "Epic" ? (chance(0.5) ? 21 : 13) : chance(0.75) ? pick(ESTIMATES) : null;

        await client.query(
          `insert into todos (
             id, board_id, column_id, board_key, title, description, type, priority,
             estimate, creator_id, assignee_id, parent_id, sprint_id,
             started_at, completed_at, completed_by, position, rank, created_at, updated_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [
            id, boardId, column.id, boardKey, input.title,
            chance(0.55) ? `${input.title}. Raised during ${board.title} planning.` : null,
            input.type, chance(0.8) ? pick(PRIORITIES) : null, estimate,
            pick(members).id, assignee?.id ?? null, input.parentId, input.sprintId,
            startedAt, completedAt, isDone ? (assignee?.id ?? null) : null,
            boardKey, boardKey * 64, createdAt,
            completedAt ?? createdAt,
          ],
        );

        const key = boardKey;

        boardKey += 1;
        todoRows += 1;

        return { id, key, title: input.title, createdAt, assignee };
      };

      for (let e = 0; e < between(3, 6); e += 1) {
        const epic = await insertTodo({
          title: pick(EPIC_TITLES),
          type: "Epic",
          parentId: null,
          columnIndex: between(0, columns.length - 2),
          sprintId: null,
        });

        epicIds.push(epic.id);
      }

      for (let t = 0; t < TODOS_PER_BOARD; t += 1) {
        // Weighted towards the done column, because a board that has been
        // running for a year has finished more than it holds.
        const columnIndex = chance(0.45)
          ? columns.indexOf(doneColumn)
          : between(0, columns.length - 2);

        const parentId = chance(0.35) && epicIds.length > 0 ? pick(epicIds) : null;

        const task = await insertTodo({
          title: `${pick(titles)}${chance(0.25) ? ` (${pick(["follow-up", "part 2", "regression", "spike"])})` : ""}`,
          type: pick(TYPES),
          parentId,
          columnIndex,
          sprintId: chance(0.45) ? pick(sprints) : null,
        });

        if (chance(0.3)) {
          for (let s = 0; s < between(1, 3); s += 1) {
            await insertTodo({
              title: pick(SUBTASKS),
              type: "Task",
              parentId: task.id,
              columnIndex: chance(0.5) ? columns.indexOf(doneColumn) : between(0, columns.length - 2),
              sprintId: null,
            });
          }
        }

        for (let c = 0; c < between(0, 4); c += 1) {
          const author = pick(members);
          const commentedAt = at(daysAgoWeighted(200), now);

          await client.query(
            `insert into comments (id, board_id, todo_id, author_id, content, created_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, $6)`,
            [randomUUID(), boardId, task.id, author.id, pick(COMMENTS), commentedAt],
          );

          commentRows += 1;
        }

        for (let a = 0; a < between(2, 8); a += 1) {
          const actor = pick(members);
          const happenedAt = at(daysAgoWeighted(360), now);

          await client.query(
            `insert into activities (id, board_id, actor_id, entity_type, entity_id, action, payload, created_at)
             values ($1, $2, $3, 'todo', $4, $5, $6::jsonb, $7)`,
            [
              randomUUID(), boardId, actor.id, task.id, pick(ACTIONS),
              JSON.stringify({ title: task.title, board_key: task.key }),
              happenedAt,
            ],
          );

          activityRows += 1;
        }
      }

      await client.query("update boards set next_key = $2 where id = $1", [boardId, boardKey]);

      console.log(`  ${board.title}: ${boardKey - 1} items`);
    }

    // The 3m window reaches back further than the calendar quarter, and the
    // gap between them has to contain work or the two periods report the same
    // number and the distinction D-15 protects is invisible.
    const quarterStart = new Date(now);

    quarterStart.setMonth(Math.floor(quarterStart.getMonth() / 3) * 3, 1);
    quarterStart.setHours(0, 0, 0, 0);

    const gapDays = Math.ceil((quarterStart.getTime() - (now - 92 * DAY)) / DAY);

    if (gapDays > 1) {
      // Older rows only. Taking the newest would move today's and this
      // week's completions back three months and leave 1d and 7d empty --
      // which is exactly what the first run of this script did.
      const movable = await client.query<{ id: string }>(
        `select id from todos
          where completed_at is not null and completed_at < now() - interval '35 days'
          order by completed_at desc limit 60`,
      );

      for (const [index, row] of movable.rows.entries()) {
        const daysAgo = 92 - Math.floor((index / movable.rows.length) * (gapDays - 1)) - 1;

        await client.query("update todos set completed_at = $2 where id = $1", [
          row.id,
          at(daysAgo, now),
        ]);
      }

      console.log(`  ${movable.rowCount ?? 0} completions placed inside the 3m-but-not-quarter window`);
    }

    // A live board has finished something today. Without this the 1d period
    // is always empty and the shortest screen has nothing to show.
    const today = await client.query<{ id: string }>(
      `select id from todos
        where completed_at is not null and completed_at < now() - interval '60 days'
        order by random() limit 14`,
    );

    for (const row of today.rows) {
      await client.query("update todos set completed_at = $2 where id = $1", [
        row.id,
        at(0, now),
      ]);
    }

    console.log(`  ${today.rowCount ?? 0} completions placed inside today`);

    const repaired = await client.query(
      `update todos
          set started_at = created_at + (completed_at - created_at) / 2
        where started_at is not null
          and completed_at is not null
          and started_at > completed_at`,
    );

    if ((repaired.rowCount ?? 0) > 0) {
      console.log(`  ${repaired.rowCount} start dates re-seated after the completion moves`);
    }

    for (const table of ["users", "boards", "board_members", "columns", "todos", "comments", "sprints", "spaces"]) {
      await client.query(`alter table ${table} enable trigger user`);
    }

    await client.query("commit");

    console.log(`  ${todoRows} todos · ${commentRows} comments · ${activityRows} activities`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  await client.query("analyze");

  const counts = await client.query(`
    select 'users' as table_name, count(*)::int as rows from users
    union all select 'spaces', count(*)::int from spaces
    union all select 'boards', count(*)::int from boards
    union all select 'columns', count(*)::int from columns
    union all select 'sprints', count(*)::int from sprints
    union all select 'todos', count(*)::int from todos
    union all select 'comments', count(*)::int from comments
    union all select 'activities', count(*)::int from activities
  `);

  console.table(counts.rows);
  console.log(`sign in as ${DEMO_SUPERADMIN} / ${DEMO_PASSWORD}`);

  await client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

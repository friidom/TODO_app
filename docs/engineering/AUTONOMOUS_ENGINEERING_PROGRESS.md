# Autonomous engineering progress

Source: the engineering audit of 2026-11-03 (30 findings, F-01 to F-30), run against
`release/2026-10-17` at `06f2532`, which is what production runs. Work happens on the
local branch `hardening/audit-2026-11`. Nothing is pushed or deployed.

Five files were already uncommitted on the release branch before this work (`seed-qa.ts`, its
`db:seed-qa` line in `backend/package.json`, `SprintControls.tsx`, `ThemeProvider.tsx` and
`oauthApi.ts`). They are left exactly as found and appear in no commit. On 2026-11-04 you decided
to keep them that way (F-20); their SHA-256 checksums were recorded before that day's work and
matched after it.

Your decisions of 2026-11-04: F-23 deferred, F-25 approved, F-20 preserve, F-28 approved on
condition (production MinIO version first, a real Docker build, no deploy).

The UI quality pass of 2026-11-06 is recorded at the end of this file, and its audit in
`UI_AUDIT_2026-11.md`.

## Baseline

The 2026-11-03 baseline on `06f2532`: 1,730 frontend, 622 backend unit and 974 backend
integration tests, lint and both typechecks all clean.

Integration tests run against a throwaway PostgreSQL 17 cluster on port 5544 in the session
scratchpad (`todo_app_test`, all 42 migrations). Browser checks use a seeded scratch database
(`veylo_qa`) on the same cluster, the working-tree API on port 4310, and a small Node stand-in
for the frontend nginx that sends the exact `add_header` values parsed from `nginx.conf`.
Docker was unresponsive on this machine for most of 2026-11-04. It answered briefly from
15:59 UTC, long enough for `nginx -t`, both image builds and the image checks, and then froze
again. From 17:58 UTC it worked again, and the running-stack checks passed (see F-28).

## Status

| ID | Priority | Title | Status | Commit |
|---|---|---|---|---|
| F-01 | P0 | Login and refresh limits are one bucket for everyone | COMPLETED (needs `TRUST_PROXY=2` on the server) | 9b1aedb |
| F-02 | P0 | Production on the compose default secrets | COMPLETED in code; MinIO and Postgres values on the server BLOCKED | 9b1aedb |
| F-03 | P0 | Cumulative flow counts `started_at` only | COMPLETED | 6de5e81 |
| F-04 | P0 | Scoped People and KPI figures are wrong | COMPLETED (one rule kept, see below) | 86296ab |
| F-05 | P1 | SVG attachment stored XSS | COMPLETED | 3f1cafd |
| F-06 | P1 | The SPA sends no security headers | COMPLETED | 33b328b |
| F-07 | P1 | A failing socket join crashes the API | COMPLETED | 9b6d040 |
| F-08 | P1 | Realtime never recovers after an expired-token reconnect | COMPLETED | a5cc794 |
| F-09 | P1 | A 429 or 5xx from /auth/refresh signs the user out | COMPLETED | 9b1aedb |
| F-10 | P1 | Backups | COMPLETED in repo; installing on the server BLOCKED | 6edd669 |
| F-11 | P1 | Dependency advisories | COMPLETED (minio chain left, as the audit said) | 466104c |
| F-12 | P1 | No tests for the F-07/F-08/F-09 paths | COMPLETED | 9b1aedb, 9b6d040, a5cc794 |
| F-13 | P2 | Stale chunks after a deploy | COMPLETED | 4034b32 |
| F-14 | P2 | CI does not run on the release branch | COMPLETED (trigger; B12-07 pipeline not built) | ac4bb4d |
| F-15 | P2 | /health returns the SPA; no log rotation | COMPLETED in repo; uptime monitor BLOCKED | 17c954f |
| F-16 | P2 | Eviction leaves a stale board | COMPLETED | a5cc794 |
| F-17 | P2 | Touch drags instead of scrolling | COMPLETED | 9756abc |
| F-18 | P2 | All three locales in the first bundle | COMPLETED | 9a87f19, 5a385e3 |
| F-19 | P2 | No browser test of the deployed stack | COMPLETED | b9c39ca |
| F-20 | P2 | Release hygiene | BLOCKED (fast-forwarding `main` needs a push; your five files preserved by decision) | |
| F-21 | P3 | No cleanup of sessions and tokens | COMPLETED | 55f590d |
| F-22 | P3 | Workflow transition check can be raced | COMPLETED | f92a7bb |
| F-23 | P3 | No grace window on refresh rotation | NOT_APPLICABLE (deferred by your decision; reuse detection unchanged) | |
| F-24 | P3 | Board page JavaScript weight | COMPLETED | 1ed72de |
| F-25 | P3 | Done grows without limit | COMPLETED | 34c3790 |
| F-26 | P3 | Hand-styled buttons | NOT_APPLICABLE as a task (adopt when touched, per the audit) | |
| F-27 | P3 | Very large components | NOT_APPLICABLE as a task (split when touched, per the audit) | |
| F-28 | P3 | Container hardening | BLOCKED (shadcn move and `USER node` done and verified in a running Docker stack; the MinIO pin needs the server's version, and SSH still times out; the MinIO image can no longer be pulled) | 466104c, b78e757 |
| F-29 | P3 | Missing `created_at` indexes | NOT_APPLICABLE now (the audit's trigger is not met; measured) | |
| F-30 | P3 | Card history misses sprint and start date | COMPLETED | 34586b0 |

## Findings

### F-02: production secrets (checked first)

Verified read-only on 2026-11-04 without printing any secret:

- SSH to the server timed out from this network (egress 213.230.79.130 is not on the
  security group's allow-list), so the in-container checks could not run.
- From outside AWS, only ports 80 and 443 answer; 22, 3000, 4000, 5433, 6379, 9000 and 9001 are
  filtered, so Postgres, Redis and MinIO are not reachable from the internet.
- An access token signed with the compose default `JWT_SECRET`, naming a random user id that
  does not exist, was refused with 401 by `GET /api/v1/me/starred`. Production's `JWT_SECRET`
  is therefore not the public default. No real account or data was touched.

Code: `backend/src/config/env.ts` refuses to start in production on the default `JWT_SECRET`
or `MINIO_SECRET_KEY` (unit test `backend/src/config/env.test.ts`).

Blocked: whether the MinIO root credentials and the Postgres password on the server are still
the compose defaults. Both are unreachable from outside, which lowers the risk, but they need the
in-container check from the audit (Remaining production actions, step 1). If the MinIO secret is
the default, this build refuses to start until it is rotated.

This is likely, not hypothetical: the checked-in `docker-compose.yml` hard-codes `minioadmin123`
in both the `minio` service (`MINIO_ROOT_PASSWORD`) and the `backend` service
(`MINIO_SECRET_KEY`), and compose `environment:` beats `backend/.env`. Unless the server's local
edit of that file changed both, production runs the default.

Remediation plan (not carried out: it needs server access and your authorization):

1. Check without printing anything:
   `sudo -n docker exec todo-app-backend-1 sh -c 'test "$MINIO_SECRET_KEY" = minioadmin123 && echo DEFAULT || echo custom'`,
   and the same for `POSTGRES_PASSWORD` against `postgres` in `todo-app-postgres-1`.
2. If DEFAULT: first run `ops/backup.sh` (or at least tar the `todo-app_minio_data` volume), and
   record the MinIO release (F-28) because root-credential changes behave differently across
   releases.
3. Generate a new secret on the server (`openssl rand -base64 32`), and put it in the server's
   compose as both `MINIO_ROOT_PASSWORD` (minio) and `MINIO_SECRET_KEY` (backend). They must
   match: the API signs in with the root credentials.
4. `sudo -n docker compose up -d minio backend`, then open an existing attachment and an avatar.
5. Rollback: put the old value back in both places and run the same `up -d`.

Steps 3 and 4 were rehearsed locally on MinIO `RELEASE.2025-09-07T16-13-09Z` (F-28): a file
uploaded before the change downloaded unchanged after it. If production runs another release,
repeat the rehearsal on that release first.

### F-01: per-client rate limits

- `backend/src/app.ts`: `app.set("trust proxy", env.TRUST_PROXY)`.
- `backend/src/config/env.ts`: `TRUST_PROXY`, an exact hop count from 0 to 5, default 0.
  It is not `true`, which would let a client choose its own address.
- `nginx.conf`: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.
- `backend/src/middleware/rateLimit.ts`: the refresh limiter skips requests without a refresh
  cookie, which are answered 401 before any database work.
- Test: `backend/src/middleware/rateLimit.int.test.ts` has two forwarded clients get two
  buckets, addresses a client prepends are ignored, and cookie-less requests are not counted.
  It fails with `TRUST_PROXY: 0`.
- `TRUST_PROXY` is deliberately not added to `docker-compose.yml`. Its `environment:` block
  overrides `env_file`, so a value there would beat the server's `backend/.env`.
- 2 is only safe if the host nginx sets X-Forwarded-For itself (`$proxy_add_x_forwarded_for` or
  `$remote_addr`). If it passes the client's header through untouched, the client's own value
  lands one hop from the right and becomes `req.ip`, which is worse than today's single bucket.
  The production logs' `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` warning suggests the host sets it
  but does not prove it, so reading the host config is a deploy step (Remaining production
  actions, step 2).

### F-09: refresh outcomes

- `src/services/api/client.ts`: `postRefresh` returns false only for 401/403. Any other error
  status throws, just as a dropped connection already did, so `sendAuthorized` keeps the session
  and the query's retry policy retries the 429/5xx.
- `src/services/auth/authApi.ts`: `restoreSession` retries an unreachable API after 1, 2, 4 and
  8 seconds before showing the sign-in page.
- Tests: `src/services/api/client.test.ts` (new; refreshed, rejected, 429/502/503, network
  failure, and three concurrent 401s sharing one refresh). The 429/502/503 cases fail against
  the old code. `restoreSession.test.ts` now asserts the retry instead of "failure means signed
  out".
- Simplified: there is no separate "Can't reach Veylo" screen. While the API is down, queries
  retry and mutations toast as they already did.

### F-05: SVG attachment XSS

- `backend/src/modules/attachments/attachments.files.ts`: `canRenderInline` is an allow-list
  (PNG, JPEG, GIF, WebP, PDF). New `attachmentMime(declared, bytes)` stores an inline type only
  when the bytes match. It reuses `sniffAvatarMime` and adds GIF and `%PDF-`. A declared type
  that is only ever downloaded (`video/mp4`, `image/svg+xml`) is kept for the UI's icons and
  tabs.
- `src/services/attachments/fileMeta.ts`: `previewKind` uses the same allow-list.
- The gate is applied when a file is read, so attachments already stored are covered.
- Tests: unit tests for the sniffer and the gate; integration tests that an SVG and HTML
  labelled image/png come back as `attachment` + `application/octet-stream`, and that the stored
  type follows the bytes. Two existing tests that uploaded the text "png-bytes" as an image now
  upload real magic bytes, and the unit test that pinned SVG as inline was inverted.

### F-06: security headers

- `nginx.conf` `location /`: `Content-Security-Policy` as the audit proposed, with
  `https://ui-avatars.com` added to `img-src` for the profile page's fallback avatar, plus
  `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options: DENY`, all `always`.
- Shipped enforcing rather than report-only, after a headless Chrome check against the built
  bundle found no violations while signing in, opening a board and a task, previewing an image
  and a PDF, and connecting the socket (HTTP 101).
- `src/securityHeaders.test.ts` hashes `index.html`'s inline scripts and fails if the CSP does
  not allow them.
- HSTS belongs on the host nginx, which terminates TLS (Remaining production actions).

### F-07: socket join failures

- `backend/src/realtime/rooms.ts`: `board:join` and `admin:join` catch everything, log, and
  answer `{ ok: false }`.
- `backend/src/server.ts`: `process.on("unhandledRejection")` logs instead of letting Node exit.
- Test: `backend/src/realtime/rooms.failure.int.test.ts` mocks both lookups to reject. Against
  the old handlers it fails with an unhandled rejection; now the ack is `{ ok: false }`, `/health`
  answers and a later join succeeds.

### F-08 and F-16: realtime recovery and eviction

- `src/services/realtime/socket.ts`: `recoverRefusedConnections`. When the handshake is refused
  (`socket.active` is false), it spends one refresh and reconnects once; the guard resets only
  after a successful connect, so a dead session cannot loop. It is wired into
  `connectBoardSocket`, which covers the board socket and the admin activity socket.
- `src/services/realtime/useBoardRealtime.ts`: on `board:evicted` it refetches the board row
  (the 404 renders "not found") and, if the page is still showing that board, toasts
  `board.accessRemoved` (en/ru/uz).
- Unit tests in `socket.test.ts` cover one refresh and one reconnect per refusal, no refresh on
  a transient error, staying down when the refresh is rejected or unreachable, and recovering
  again after a successful connect.
- Browser check (`qa/realtime.mjs`): `ACCESS_TOKEN_TTL=1m`, open a board, wait 75 s, kill and
  restart the API, then create a card through the API.
  - Fixed bundle: the socket was refused, spent one refresh, reconnected (handshake logged by
    the proxy) and the card appeared live.
  - Control bundle with the old `socket.ts`: refused, no refresh, and the card never appeared.
    The bug is real.
  - Deleting the board then showed the toast and the not-found page.

### F-03: cumulative flow

`admin.repo.ts` `cumulativeFlow` counts started as `coalesce(started_at, completed_at)` in the
base and delta CTEs. A new test in `admin.flow.int.test.ts` (done cards with no `started_at`,
inside and before the window) fails on the old query and passes now.

### F-04: scoped People and KPI views

- Scoped by board or space, `userMetrics` lists the scope's members plus anyone with scoped work
  in the period (`done`/`said`/`did`), so someone who has since left still shows their work. The
  unscoped list is unchanged, and the drill-down on one person answers for anyone.
- `admin.service.ts`: a scoped view returns `target_points`/`performance` as null, which the UI
  already renders as "—". This is the audit's recommended rule: hide the KPI when scoped.
- Deliberate change to a pinned rule: `admin.leaderboard.int.test.ts` had a test "keeps every
  user in the list, scoped or not". It is replaced by the scoped-roster rule the audit asked
  for. Two new tests (scoped roster; no target when scoped) fail on the old code.
- Kept as is: "boards contributed to" stays a count of all of a person's boards. Its existing
  tests pin that on purpose ("a fact about the person"), and the audit's harm was the roster and
  the percentage. If you want it scoped too, it is a one-line change in `joined`.

### F-10: backups

- `ops/backup.sh`: pg_dump (custom format) plus a tar of the MinIO volume into `~/backups`. Each
  is read back (`pg_restore -l`, `tar -t`) before being kept, and only its own `veylo-*` files
  older than 7 days are deleted; the existing `todo_app-*-pre-*.dump` files are left alone.
- `ops/restore-check.sh`: restores the newest dump into a throwaway `postgres:18` with
  `--network none`, prints live vs restored counts, and exits 1 if any attachment row has no
  object in the archive.
- Verified through a `docker` stand-in against the scratch cluster: retention removed only the
  old `veylo-*` file; the restore check flagged a deliberately missing object, then passed once
  it existed.
- Blocked: installing the cron job, the weekly off-machine copy and the first real restore test
  all need the server.

### F-11: dependencies

- Backend: `npm audit fix`, lockfile only (body-parser 2.4.0, multer 2.5.0, zod 4.6.7,
  nodemailer 10.3.1, qs 6.17.1 and more). `npm audit --omit=dev` now reports only the minio
  chain (minio, query-string, decode-uri-component, stream-json), whose fix is a major-version
  downgrade.
- Frontend: the `shadcn` CLI moves to devDependencies (only its CSS is imported, at build time),
  Vite goes to 8.1.6, and `npm audit fix` clears the rest. Runtime advisories are 0; 17
  moderate/low dev-only ones remain, each needing a major-version change.
- All suites pass after the updates (frontend 1,743, backend unit 630, integration 985).

### F-12: tests for the failure paths

`src/services/api/client.test.ts` (F-09), `backend/src/realtime/rooms.failure.int.test.ts`
(F-07) and the `recoverRefusedConnections` tests in `socket.test.ts` (F-08). Each fails against
the code it guards.

### F-13: stale chunks after a deploy

- `src/main.tsx`: on `vite:preloadError`, reload once (guarded for 60 s in `sessionStorage`).
- `nginx.conf`: `/assets/` answers a missing file with 404 instead of `index.html` and caches
  hashed files for good (`expires max`); `index.html` revalidates (`expires -1`). `expires` is
  used rather than `add_header`, which would drop the security headers in the nested location.
- Browser check (`qa/deploy.mjs`): serve build A, open the app, swap in build B (a renamed
  ProfilePage chunk, missing files answer 404), then navigate to /profile. The fix reloads once
  and the page renders. A control build without the listener shows "This page stopped working.
  Failed to fetch dynamically imported module".

### F-14: CI on release branches

`.github/workflows/ci.yml` runs on pushes to `main` and `release/**`. The B12-07 pipeline
(deploy only a commit that CI passed) is not built.

### F-15: /health and log rotation

`nginx.conf` proxies `location = /health` to the API. `docker-compose.yml` caps every service's
json-file log at 5 x 10 MB through an `x-logging` anchor (YAML checked with Ruby's parser;
`docker compose config` could not run here). Blocked: pointing a free uptime monitor at
`https://veylo.work.gd/health` needs an account.

### F-17: touch scrolling

`useKanbanDnd.ts` uses `MouseSensor` (8 px) plus `TouchSensor` (250 ms hold, 5 px tolerance);
cards are `touch-manipulation` rather than `touch-none`. Browser check (`qa/touch.mjs`, 390 px
with touch emulation):

- Fixed bundle: a swipe scrolls the column by 333 px without dragging, and a long press drags.
- Control (old bundle): the swipe dragged and did not scroll.
- A desktop mouse drag still moves a card to another column (checked through the API).

### F-18: locales on demand

`src/components/i18n/index.ts` bundles English only; Russian and Uzbek are loaded with `import()`
by the exported `changeLanguage`, which the language switcher uses. `main.tsx` awaits the saved
language before the first render. The entry chunk went from 149 KB to 79 KB gzipped (ru 35 KB
and uz 29 KB, fetched on demand). In headless Chrome a saved "ru" rendered Russian on first
paint, and switching to Uzbek loaded and rendered it. Commit 9a87f19 left `errorMessage.test.ts`
calling i18next directly, so four tests failed until 5a385e3 switched it to `changeLanguage`
with the assertions unchanged. Only that one intermediate commit is red.

### F-19: browser smoke

`ops/smoke-browser.mjs` drives the installed Chrome over CDP with no new dependency. It checks
`/health`; two isolated contexts sign in; it creates a throwaway board with two cards; both
contexts open it and need a 101 WebSocket handshake; one drags a card to the next column and the
other must show it there without reloading. Any CSP violation fails the run, and the board is
deleted afterwards. It passed against the scratch stack and failed with "the WebSocket upgrade did
not succeed" against a proxy that refuses upgrades. Run it against `docker compose up --build`
before each release.

### F-20: release hygiene (blocked)

Your decision on 2026-11-04: preserve your five files. They are untouched, unstaged and in no
commit, and their checksums match the ones recorded before that day's work. What remains is
that `main` (`72b498b`) is seven commits behind production (`06f2532`) and this branch is on
top of that. Fast-forwarding `main` needs a push, which this work does not do.

### F-21: cleanup job

`auth.repo.ts` `pruneDeadAuthRows` removes reset, verification and OAuth link tokens used or
expired 30 days ago. It removes session rows dead for 30 days only when no session in their family
is live, so replaying a rotated token still revokes a live family. `auth.cleanup.ts` runs it a
minute after start and then daily (timers are `unref`'d); `server.ts` schedules it. Activity rows
are history and are not pruned. Test: `cleanup.int.test.ts`.

### F-22: transition race

`todos.service.ts`: both status-writing routes lock the card's row inside the write transaction
(`todosRepo.lockedStatusIs`, `select … for update`) and require the status the workflow check
approved, otherwise 409 "Someone else moved this card". The new test in `todos.int.test.ts` holds
the row in another transaction while moving it In Progress → To Do, then fires In Progress → In
Review through each route. Without the lock both answered 204/200 and the card made the forbidden
To Do → In Review move; now both get 409.

### F-23: refresh grace window (deferred)

Deferred by your decision on 2026-11-04. Nothing in the repo changed for F-23: a replayed
rotated refresh token still revokes its whole family, as before.

### F-24: board page weight

`BoardPage.tsx` lazy-loads Summary, Calendar, Timeline, Backlog and Sprint insights, with the
existing per-view skeleton as the fallback; `BoardActions.tsx` lazy-loads the two workflow
editors. The board and the List stay in the chunk. BoardPage went from 530 KB / 141 KB gzipped to
290 KB / 77 KB. In headless Chrome every view and Manage workflows loaded its chunk and rendered
with no errors.

### F-25: Done grows without limit

Approved on 2026-11-04 as a visibility default only. `boardViewPrefs.ts`
`defaultBoardViewPrefs(sprintsEnabled)` makes "Hide done work items after" default to 14 days on
a board with sprints off; a sprint board keeps Never, because it only shows the running sprint.
`resolveBoardViewPrefs` takes `sprintsEnabled` (required, so every caller had to say), and
`useBoardViewPrefs` passes the board's flag.

- Only the default changed. A saved board view, a device's own settings or a personal choice of
  Never all still win; Reset returns to the board's default. Saved views that hold Never keep it.
- Nothing is deleted or archived: `hideStaleDone` filters the rendered array only. List, Backlog
  and drag-and-drop (which reorders the unfiltered array) see every card. The existing hint
  under the setting already says so.
- Tests (`boardViewPrefs.test.ts`): the 14-day default without sprints, saved and device Never
  kept, a personal Never with Reset back to 14, the sprint-board default unchanged, and the input
  array untouched. The two default tests failed against the previous `boardViewPrefs.ts`.
- Browser, on the clean-clone build against a seeded board switched to sprints off: the select
  showed 14 days, the board hid exactly the 39 top-level cards done before the cutoff (74 of
  113 shown), List showed all 113 at the same time, and Never showed 113. A sprint board
  showed Never and hid nothing.

### F-26 and F-27: buttons and large components

The audit describes both as work to do when a file is touched for another reason ("No sweeping
refactor", "This is not a task on its own"). `ui/button.tsx` already has cva variants. A sweep
across 293 buttons or a split of five large components with no component tests would add
regression risk for no functional gain, so neither was done as a task.

### F-28: container hardening (blocked)

Approved on 2026-11-04 on condition: production's MinIO version first, a real Docker build, no
deploy.

- Done: the shadcn CLI is a devDependency (466104c).
- MinIO pin: not done. SSH from this network (213.230.79.130) still times out, so the release
  production runs is unknown, and pinning without it could downgrade the data. Read it with
  `sudo -n docker inspect todo-minio --format '{{.Config.Image}} {{.Image}}'` and
  `sudo -n docker exec todo-minio minio --version`, then pin `quay.io/minio/minio` to that exact
  release (or its digest) in `docker-compose.yml`.
- `USER node`: done (b78e757), after the checks below passed in a running stack. Docker was
  retried at 14:05–14:20 UTC on 2026-11-04, after you said it was being prepared, and was still
  unavailable:
  - The engine's `/_ping` times out (curl exit 28). Docker Desktop's own control socket
    (`backend.sock`) does not answer either.
  - `monitor.log` shows Resource Saver stopped the VM at 03:45 UTC (`VM stopped`,
    `Idle:shutdown`). Nothing after that shows it waking: API calls reach Docker Desktop's
    request cache and go no further.
  - The `com.docker.backend` process is still the one started 15 days ago. Docker Desktop is
    stuck and needs Restart from the whale menu. The VM is already off, so a restart stops no
    containers. It was left to you.

  Docker answered from 15:59 UTC (engine 29.8.0, linux/arm64). Your five `todo-app` containers
  were stopped (since 9 days), and none of them or their volumes was touched. Everything ran
  from the clean clone at `4f1a4d4` plus `USER node`, as the separate project `veylo-verify`:
  - The real build passed. The backend image (base `node:24-alpine`) built with `npm ci`,
    `db:generate` and `tsc`. The first frontend build was killed at 16:38:09 by an engine
    restart sent from the Docker Desktop window (`POST /engine/restart`, user agent
    Docker-Desktop GUI); the rebuild passed.
  - Image contents, checked inside the image:
    - `Config.User` is `node`, and `id` gives uid 1000 (node), gid 1000;
    - `/app`, `dist`, `node_modules` and `prisma/migrations` are `root:root 755`, so `touch`
      into each is "Permission denied";
    - all 43 migrations are present;
    - `$HOME` (`/home/node`) is writable, which npm needs for `npm run db:migrate`;
    - node v24.22.2, npm 11.19.1.
  - Production guard, in the real image: `NODE_ENV=production` with the compose defaults
    refuses to start. It names both `JWT_SECRET` and `MINIO_SECRET_KEY` as "docker-compose.yml's
    public default".
  - At 16:39:45 UTC, right after `compose up` sent its first two calls, Docker Desktop's
    `com.docker.backend` stopped logging altogether (its `GET /time` heartbeat too, at 0% CPU)
    and `/_ping` timed out again. No container had been created.

  Docker answered again at 17:58:14 UTC (the same 15-day-old `com.docker.backend`). The stack
  then ran from the same images, as project `veylo-verify`, with the override in step 4 of
  Remaining production actions (no ports but `127.0.0.1:13080`, Postgres on tmpfs, MinIO on a
  scratch bind mount, no named volumes). `up -d --no-build` was healthy within 30 seconds:
  - Backend user: `id` gives `uid=1000(node) gid=1000(node)`, and `ps` shows
    `node dist/server.js` as PID 1, user `node`.
  - Permissions: `touch /app/x` and `touch /app/prisma/migrations/x` are "Permission denied"
    in the running container.
  - Migrations: the entrypoint's `prisma migrate deploy` applied all 43 as uid 1000.
    `_prisma_migrations` has 43 rows, none unfinished or rolled back; the last is
    `0043_activity_sprint_start`.
  - Startup log: "listening on http://localhost:4000 (development)", with Redis, PostgreSQL
    and MinIO connected and both buckets ready.
  - `/health` inside the container:
    `{"status":"ok","database":"up","cache":{"status":"up",…}}`.
  - `nginx -t` inside the running frontend container: syntax ok, test is successful.
  - MinIO: `minio --version` in the container gives `RELEASE.2025-09-07T16-13-09Z`
    (commit 07c3a429…, go1.24.6 linux/arm64). The branch's API created both buckets on it and
    served every file below.
  - Attachments and avatars, through the frontend nginx on `:13080`:
    - a PNG uploaded and downloaded byte for byte;
    - an SVG served inline came back as `application/octet-stream` with
      `Content-Disposition: attachment` (F-05);
    - after delete, the attachment answered 404;
    - an avatar uploaded and its `avatar_url` answered 200 `image/png`.
  - `ops/smoke-browser.mjs http://localhost:13080`: PASS (health, both contexts sign in, a
    board with two cards, both join its socket, a drag in one shows in the other).
  - MinIO secret-change rehearsal, the F-02 remediation in miniature:
    1. A 64 KiB random file was uploaded.
    2. MinIO and the backend were recreated with a new random MinIO secret in both services,
       a new `JWT_SECRET`, and production settings (`NODE_ENV=production`, `COOKIE_SECURE`,
       email verification, `MAIL_DRIVER=smtp`, `TRUST_PROXY=1`). The values came from a 0600
       env file and were never printed.
    3. The backend passed the production guard: "listening … (production)", "No pending
       migrations to apply", MinIO connected.
    4. The file downloaded with the same SHA-256.
    5. The smoke test passed again, in production mode.

    On this MinIO release, changing the root password over existing data needs nothing
    beyond setting the same new value in both services.
  - Teardown: `docker compose … down` without `-v`. It removed the five `veylo-verify`
    containers and their network only. Your five `todo-app` containers (stopped) and the six
    existing volumes are unchanged, and nothing was pruned.

  Before Docker returned, the closest check was run: the image's runtime contents copied into a
  read-only directory on macOS, from which migrations and the server ran. The real-container run
  above supersedes it.
- On the server, the compose file has a local edit. After `git stash pop`, check that it mounts
  no volume into `backend`: `sudo -n docker compose config backend | grep -A3 volumes`. A
  root-owned volume there would no longer be writable by uid 1000. The checked-in compose
  mounts none.
- MinIO: the copy of `quay.io/minio/minio:latest` cached on this machine is
  `RELEASE.2025-09-07T16-13-09Z` (digest `sha256:14cea493…936e`, built 2025-09-07). The branch
  runs on it, as above. Whether production runs the same release is still unknown.
- **New risk: MinIO's official image can no longer be pulled anonymously.** Checked on
  2026-11-04:
  - `quay.io/minio/minio` answers 401 for both `latest` and `RELEASE.2025-09-07T16-13-09Z`. A
    control repository on quay.io (`prometheus/node-exporter`) answers 200.
  - On Docker Hub, `minio/minio` answers 401 and its repository page says "object not found".
    `library/nginx` answers 200.

  Production therefore runs MinIO only from the image cached on the server. Any of the
  following would leave attachments and avatars unable to start:
  - `docker image prune -a` or `docker system prune -a`;
  - a new server;
  - `docker compose pull`.

  Before anything else on the server, save that image next to the backups:
  `sudo -n docker save quay.io/minio/minio:latest | gzip > ~/backups/minio-image-$(date +%Y%m%d).tar.gz`.
  Restore it with `docker load`. Do not run either prune. Pinning `docker-compose.yml` to the
  server's exact version, or digest, still needs that version from the server, and was not
  done. Choosing a maintained S3-compatible source for the long term is a separate decision
  for you.

### F-29: created_at indexes

The audit's own condition is to add them "when `npm run bench:explain` shows the scan matters".
On the seeded scratch database (2,615 cards and 2,341 comments, about 60 times production) the
30-day `created_at` scans take 0.67 ms and 0.36 ms. Not added.

### F-30: sprint and start-date history

Migration `0043_activity_sprint_start` (forward-only) adds `sprint_changed` and `start_changed`
to `activities_event_valid` and redefines `log_todo_activity()` as 0038 left it plus two blocks.
`sprint_changed` stores the sprint names so History can name a deleted sprint. `activityText.ts`,
`historyText.ts` and the admin action labels render both, in en/ru/uz. Tests:
`history.int.test.ts` and new cases in `historyText.test.ts`.

## Final verification (2026-11-04)

From a fresh `git clone` of this branch at `7bcb807` (so your uncommitted files were not in it),
with `npm ci` in both projects and new databases on the scratch PostgreSQL 17 cluster:

| Check | Result |
|---|---|
| Frontend `npm test` | 1,751 passed (120 files) |
| Frontend `npm run build` (tsc -b + vite) and `npm run lint` | clean |
| Frontend `npm audit --omit=dev` | 0 vulnerabilities |
| Backend `npm run build` (tsc) | clean |
| Backend unit | 630 passed, 1 skipped (42 files) |
| Backend integration, on a database built from nothing | 991 passed, 1 skipped (52 files) |
| Backend `npm audit --omit=dev` | 4, all under `minio@8.0.7` (F-11) |
| `prisma migrate deploy` on an empty database | 43 of 43 applied |
| `prisma migrate diff` from that database to `schema.prisma` | empty: no drift |
| Upgrade path: migrate to 0042, seed demo data (2,524 cards, 6,239 activity rows), then deploy | 0043 applied, every count unchanged; the new sprint and start-date blocks wrote correct rows |
| `ops/smoke-browser.mjs` against the clean build and compiled API (`node dist/server.js`) | PASS: health, sign-in, 101 upgrade, live drag, no CSP violations |
| F-25 in the browser | as described under F-25 |
| `docker compose config` at `4f1a4d4` (client-side, engine deliberately unreachable, no `backend/.env`) | valid: 5 services, every one with the 10 MB × 5 log cap; images `postgres:18`, `redis:8-alpine`, `quay.io/minio/minio:latest` |
| `nginx -t` with this branch's `nginx.conf` in `nginx:alpine` (nginx 1.31.6, `--add-host backend:127.0.0.1`) | syntax ok, test is successful |
| Docker build of backend (with `USER node`) and frontend, as project `veylo-verify` | both built (the frontend on the second try, see F-28) |
| Backend image: user, permissions, migrations | uid 1000; `/app` root-owned and not writable; 43 migrations present; `$HOME` writable |
| Production guard in the real image, on compose defaults | refuses to start, naming `JWT_SECRET` and `MINIO_SECRET_KEY` |
| Stack run as uid 1000 (`veylo-verify`, 17:58 UTC) | healthy; uid 1000; `/app` not writable; 43 of 43 migrations applied by the entrypoint; `/health` ok |
| `nginx -t` inside the running frontend container | syntax ok, test is successful |
| MinIO in the stack | `RELEASE.2025-09-07T16-13-09Z`; buckets created, every file served |
| Attachments and avatars through nginx | PNG byte for byte; SVG forced to download; 404 after delete; avatar 200 |
| MinIO secret change plus production mode | 64 KiB file survived with the same SHA-256; production guard passed |
| `ops/smoke-browser.mjs` against the Docker stack | PASS in development mode, PASS in production mode |

3,372 tests pass against the 3,326 baseline, and none was removed. Two existing tests that pinned
the old behaviour were changed on purpose: the SVG-inline unit test (F-05) and the "every user,
scoped or not" leaderboard test (F-04). Both changes are explained above.

The 43 migrations: numbered 0001 to 0043 with no gaps or duplicates, none empty,
`migration_lock.toml` unchanged, and 0043 is the only one this branch adds. No existing migration
was edited.

Review of every commit on the branch found no stray files, no attribution trailers and none of
your files. It found two problems, both fixed in 7bcb807: `labelDiff`'s comment had ended up
above `sprintLabel`, and six frontend files that were prettier-clean before this branch no
longer were. The backend does not follow prettier (nearly every file differs at `06f2532`), so it
was left as is.

### Unrelated issue found

`gitlab.webhook.int.test.ts` failed one run in three: `linkStatus` compares millisecond
timestamps, and a failure recorded in the same millisecond as the token save reads as already
fixed. Only the test was affected, so it now waits 2 ms after linking (commit ac98041). Six
consecutive runs passed.

## Remaining production actions

These need a person with server access. None has been done. In order:

0. Save the server's MinIO image before touching anything:
   `sudo -n docker save quay.io/minio/minio:latest | gzip > ~/backups/minio-image-$(date +%Y%m%d).tar.gz`.
   It can no longer be pulled (F-28), so this copy is the only way back if the image is lost.
   While there, read its version for the pin with `sudo -n docker exec todo-minio minio --version`.
1. Run the F-02 checks on the server (commands under F-02). If the MinIO secret is the
   default, which the checked-in compose file makes likely, follow the remediation plan there
   before deploying, or this build refuses to start.
2. Read the host nginx config: `grep -rn "X-Forwarded-For" /etc/nginx/`. It must set the header
   (`$proxy_add_x_forwarded_for` or `$remote_addr`). Only then add `TRUST_PROXY=2` to the
   server's `backend/.env`. If the host does not set it, use `TRUST_PROXY=1`, which is no worse
   than today.
3. Done locally on 2026-11-04: `nginx -t` passed on this branch's `nginx.conf` in
   `nginx:alpine` (1.31.6), with
   `docker run --rm --add-host backend:127.0.0.1 -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t`.
4. Done locally on 2026-11-04 (F-28): the stack below ran, and the smoke test passed in both
   modes. Build and start the release candidate locally and run `ops/smoke-browser.mjs` against it.
   Do not run a plain `docker compose up --build` on a machine that has the dev stack.
   `docker-compose.yml` sets `name: todo-app` and `container_name: todo-minio`, so it would
   replace the dev containers and run migration 0043 on the dev database volume. Instead, from
   a clean checkout of the branch, with an override file that:
   - sets `name: veylo-verify`;
   - resets every service's `ports` and `volumes`. It uses `tmpfs` for `/var/lib/postgresql`,
     and either `tmpfs` or a bind-mounted scratch folder for MinIO's `/data`;
   - sets `container_name: !reset null` on `minio` and `restart: "no"` everywhere;
   - publishes only the frontend, on `127.0.0.1:13080:80`;
   - points `CORS_ORIGIN`, `APP_URL` and `API_PUBLIC_URL` at `http://localhost:13080`.

   Then run `docker compose -f docker-compose.yml -f verify.yml up -d --build`, then
   `ops/smoke-browser.mjs http://localhost:13080`, then
   `docker compose -f docker-compose.yml -f verify.yml down`. Nothing persists, and no volume is
   created or removed. The override's merge was checked with `docker compose config`.
5. Take the usual pre-deploy `pg_dump`: migration 0043 runs on start.
6. Deploy with `git stash`, `git merge --ff-only`, `git stash pop` (the branch changes
   `docker-compose.yml`, which the server keeps a local edit of), then `docker compose config`
   and `up -d --build`. `env_file` is read when a container is created, so `TRUST_PROXY` takes
   effect with this `up`. Before the `up`, check that the server's compose mounts no volume into
   `backend` (F-28): the backend now runs as uid 1000.
7. Afterwards: add `Strict-Transport-Security` on the host nginx; install `ops/backup.sh` in
   cron with the weekly off-machine copy, and run `ops/restore-check.sh` once (F-10); point a
   free uptime monitor at `https://veylo.work.gd/health` (F-15).
8. F-28: pin MinIO to the version read in step 0. `USER node` is done (b78e757).

## UI quality pass (2026-11-06)

This pass is on the branch `feature/ui-quality-pass-2026-11`, on top of `1b6e53f`: the fix and
feature commits in the table below, and the documentation commits that record them. It is local
only; nothing was pushed, merged or deployed. Your five uncommitted files were left
exactly as found. Their SHA-256 checksums matched before and after, and none of them is in a
commit.

| Item | Status | Commits |
|---|---|---|
| A1 UI audit | 7 defects fixed (U-01 to U-06, and U-09 after your review), 2 noted and left (U-07, U-08), all in `UI_AUDIT_2026-11.md` | ebf7c8f, b101a50, 5b9481d, bc83eb5, 99f3dea |
| A2 Fixed and Flexible columns | COMPLETED | 9334fdf |
| A3 Customize sidebar | COMPLETED. The dialog text was corrected after your second review | b5dd3de, ae3d548 |
| B Agent permissions (AgentShield) | COMPLETED locally. Extended with ask rules and the sandbox after your first review, and moved to your user settings after your second. No commit contains either settings file | |

### A2: column sizing

The setting already existed, and it is still stored in the same two places. A person's unsaved
view changes are kept per board on their device. The board's saved view, `boards.view_settings`,
applies to everyone once someone saves it. `KanbanBoard` reads the one value, `columnSize`, once
and passes it down.

Fixed columns are `w-[264px]`. Flexible columns are `FLEX_COLUMN`:
`min-w-60 flex-1 basis-0 contain-inline-size`, defined in `columnChrome.ts` and used by the main
row, every swimlane row and the loading skeleton. The classes do the following:

- `flex-1` with `basis-0` shares the row out equally, whatever the cards hold.
- `min-w-60` sets a 240 px floor, below which the board scrolls instead.
- `contain-inline-size` stops an unwrapped card title from widening its column.

CSS does all of the arithmetic, so there is no measuring in JavaScript and no inline width.

Measured on the final tree:

| Case | Fixed | Flexible |
|---|---|---|
| 2 columns at 1920 px | 264 px each, 1,040 px left empty | 784 px each, nothing empty |
| 3 columns at 1440 px | 264 px, 284 px empty | 359 px each |
| 4 columns at 1024 px | 264 px, scrolls 408 px | 240 px floor, scrolls 312 px |
| 8 columns at 1920 px (two long names, a 12-card column, two empty ones) | 264 px, scrolls 616 px | 240 px, scrolls 424 px |
| 3 columns at 1440 px, sidebar collapsed | unchanged | 359 px → 428 px |
| Board settings panel open (352 px) | scrolls 68 px | 241 px each, no scroll |
| Task dialog open | unchanged | unchanged |
| 5 columns at 150 % and 200 % zoom, and on a phone | | 240 px floor, scrolls |
| Swimlanes (grouped by assignee) | 264 px | 367 px each |
| Column drag ghost | | 359 px for a 359 px column |

### A3: Customize sidebar

"Customize sidebar" sits in the sidebar footer, and on the collapsed rail as an icon. On a phone
it closes the sheet first. The dialog lists the real destinations: For You, Recent, Starred,
Superadmin (offered only to superadmins) and Notifications. Below them are the Spaces and Filters
sections, each space with its boards under it.

- **Rows:** every row has a checkbox and a grip. The grip drags with a pointer, or with Space and
  the arrow keys. Unfiled has no grip, because it always stays last.
- **Saving:** edits are a draft. Save applies them, and Cancel or Escape discards them.
- **Restore defaults:** resets order and visibility, but not which sections are open.
- **Hidden items** move to a More section at the bottom of the sidebar, collapsed by default. On
  the rail, a More button expands the sidebar with More open.
- **Permissions:** hiding an item changes no permission. `/admin` is still guarded by its route
  and by the API.

The layout is stored in `localStorage` through the existing zustand store, under
`sidebar:layout:<userId>`, so another account on the same browser keeps its own. The old
device-wide key is read until the first save and then removed. `sidebarView` in
`services/sidebar/layout.ts` is the one place that decides what the sidebar shows and what goes
to More. `ReorderContext` now claims an Escape that cancels a drag, so the dialog around the
list stays open. In headless Chrome, 35 checks pass on the desktop and 7 at phone width.

### B: agent permissions

These are the changes to `.claude/settings.local.json`. A backup of the original is at
`~/.claude/projects/-Users-onesadboy-Documents-TODO-app/settings.local.json.2026-11-06.bak`.

- **Removed from allow:** `Bash(python3 -)`, which ran any Python fed to it with no prompt. It
  now goes through the normal permission check. `Bash(git stash *)` also moved from allow to
  deny.
- **New deny list:**
  - reading `~/secret`, `~/.ssh` and `~/.aws`;
  - `git stash`;
  - `git reset --hard`, and `git push --force` or `-f`, with the flag in any position;
  - `docker system prune` and `docker volume rm`.
- **Deliberately left out of the deny list:** `git push --force-with-lease`.
- **Not touched:** GateGuard, the other hooks and the MCP configuration.

Each rule was tried in this session. The `Read` denies hold for the Read tool and for `cat`. The
git and docker denies hold with the flag after the branch name. A deny beats the broad
`Read(//Users/onesadboy/**)` allow, and the rest of the home folder stays readable. A plain push
and a plain reset still work; they were tried in a throwaway repository with a local remote.

Bash rules match a command as it is written: `bash -c '…'`, `/usr/bin/git …` or a script gets
past them. They guard against mistakes; they are not a sandbox.

AgentShield 1.6.0 went from grade D, 55/100, to D, 56/100; its permissions score went from 74 to
81. The two high findings fixed are the `python3 -` allow and "no deny list". What it still
reports:

- **471 critical "Azure storage keys" in `package-lock.json`:** a false positive. They are
  `integrity` hashes.
- **"System prompt extraction" in `CLAUDE.md`:** a false positive. It matches the words "print
  rule" inside "pre-sprint rule".
- **"Missing prompt defense" in both `CLAUDE.md` files and the four agents:** fixing these would
  mean adding boilerplate to satisfy the scanner, which the brief rules out.
- **Four new medium findings:** they ask for deny rules on `rm -rf`, `sudo`, `chmod 777` and
  writes to device files. They appeared because a deny list now exists, and are left for your
  decision.

### Verification on the final tree (bc83eb5)

| Check | Result |
|---|---|
| Frontend `npm test` | 1,774 passed in 121 files. The last recorded run, on 2026-11-04, had 1,751; the new tests are for `boardDrag`, the sidebar layout and `reorder` |
| `npm run lint` | clean |
| `npm run build` (`tsc -b`, then `vite build`) | clean |
| The same three on an export of `HEAD` alone, without your uncommitted files | clean, and 1,774 passed |
| Backend | not run: this branch changes no backend file |
| Browser, headless Chrome | Drop gap: see the note below. Backlog and Calendar: every touch and mouse check passes, and the row menus open on screen on a phone. Customize sidebar: 35 of 35 on the desktop, 7 of 7 on a phone. Column sizing: as in A2 |
| Your five files | SHA-256 checksums match, and none is in a commit |

The drop-gap script passed 8 of its 9 checks. The ninth drags a card from In progress to Done,
the only target left after earlier runs' drops had emptied To do. The workflow refuses that move
("No transition to DONE"), so drawing no line is correct. Two allowed drags were checked
instead, one within In progress and one from In progress to In review. Each lit exactly one line
and left nothing lit after Escape.

### Decided in your review

All four open questions were answered:
- deny `docker volume prune` and `docker compose down -v`;
- keep the `git stash` deny;
- evaluate the sandbox;
- fix U-09.

The Jira screenshots never reached this session, so the work follows the brief's written
descriptions and the existing implementation.

## Second pass after your review (2026-11-06)

### Permission rules: syntax and precedence

These points come from the Claude Code permission docs. Each one was then checked in this
session, using probe rules that applied the same pattern to a harmless `echo`.

- **Order:** rules are checked deny first, then ask, then allow, and the first match decides.
  - A deny in any settings file beats an allow in any other.
  - An allow cannot carve an exception out of a deny.
  - An ask beats an allow.
  - Proof: `npx prisma migrate reset` is denied even though `Bash(npx prisma *)` is allowed.
- **Wildcards:** `*` can sit anywhere in a rule. A trailing ` *` also matches the bare command, so
  `Bash(docker volume prune *)` blocks a plain `docker volume prune`.
- **Compound commands:** deny and ask rules apply to every part of a compound command (`cd x &&
  …`, subshells, `$(…)`). They also match past a leading `VAR=value`.
- **Paths:** a leading `/` in a path rule in this file anchors at the project root, and `//` is
  the filesystem root.
- **Limit:** rules match the command as written. `/bin/rm`, `bash -c '…'`, `git -C . push` or a
  script gets past them, which is what the sandbox is for.

### New rules in `.claude/settings.local.json`

This morning's version is backed up at
`~/.claude/projects/-Users-onesadboy-Documents-TODO-app/settings.local.json.2026-11-06-round1.bak`.

**Deny.** Claude can never run these, but you can still run any of them yourself in your own
terminal:
- **Docker volumes:**
  - `docker volume prune`;
  - `docker compose … down … -v` and `docker-compose … down … -v`, with `-v` or `--volumes`
    anywhere after `down`.

  Each of these deletes the `pgdata` and `minio_data` volumes, which hold the development
  database and the attachments.
- **Permissions:** `chmod … 777 …`, including `0777` and `-R`.
- **Databases:**
  - `npx prisma migrate reset`. It drops the database, and this morning's `npx prisma *` allow
    let it run without a prompt.
  - `dropdb`.
- **History rewrites:** `git filter-branch` and `git filter-repo`.
- **Files outside the project:**
  - reading `~/.docker/config.json`;
  - editing anything under `~/.docker`;
  - editing Docker Desktop's data (`~/Library/Containers/com.docker.docker` and
    `~/Library/Group Containers/group.com.docker`);
  - editing the shell startup files and `~/.gitconfig`.
- **Kept:** the full `git stash` deny and every rule from this morning.

**Ask.** These always prompt you, even in auto mode:
- `sudo`, any `rm`, and `find … -delete`.
- **Git commands that discard work or rewrite history:**
  - `git clean`, `git checkout .`, `git checkout … -- …` and `git restore`;
  - `git reset` (the `--hard` forms stay denied) and `git branch -D`;
  - `git rebase` and `git commit --amend`;
  - every `git push` (force pushes stay denied).
- **Docker removals:** `docker rm`, `docker compose rm`, `docker-compose rm`, and the prunes that
  are not denied, such as `docker image prune`.
- **Prisma:** `npx prisma db push` and `npx prisma migrate dev`.
- **Files:**
  - reading or editing `.env` and `.env.local`, at any depth;
  - editing `backend/prisma/migrations/**`;
  - editing Claude Code's own settings files, for the project and for your user.

**Not added:**
- a blanket deny on `sudo` or `rm -rf`, per your instruction;
- a deny on `> /dev/…`, which would also block every `2>/dev/null`. The sandbox blocks writes to
  device files instead.

Claude Code also never auto-approves an `rm` that it recognises as aimed at a critical path, such
as the filesystem root or the home folder.

### Sandbox: enabled

```json
"sandbox": {
  "enabled": true,
  "autoAllowBashIfSandboxed": false,
  "excludedCommands": ["docker *", "docker-compose *"],
  "network": {
    "allowLocalBinding": true,
    "allowUnixSockets": ["/private/tmp/claude-501/tsx-501"]
  }
}
```

What each key does:

- **`enabled`:** every Bash command Claude runs goes through macOS Seatbelt.
  - It can write only to the project folder and its own temp folder (`/tmp/claude-501`). Even
    there it cannot write to `.claude` settings, `.git/hooks` or `.git/config`.
  - No program it starts can read the Read-deny paths: `~/.ssh`, `~/.aws`, `~/secret` and
    `~/.docker/config.json`.
  - Network traffic goes through a proxy that lets through only approved hosts.
- **`autoAllowBashIfSandboxed: false`:** the sandbox only adds restrictions and approves nothing
  new. Commands go through the same allow rules and auto-mode classifier as before.
- **`excludedCommands`:** Docker needs its socket and `~/.docker`.
  - A `docker` or `docker-compose` command run on its own goes outside the sandbox. It still
    passes the normal permission check, so the deny rules above apply.
  - Inside a compound command (`… && docker …`) it stays sandboxed and cannot reach Docker.
- **`allowLocalBinding`:** lets dev servers listen on ports, and lets commands connect to
  localhost: PostgreSQL, Redis and the API.
- **`allowUnixSockets`:** `tsx watch`, the backend's `npm run dev`, opens an IPC socket in this one
  directory. Without it the backend dev server exits with `listen EPERM`. All other Unix sockets
  stay blocked, Docker's included.

The sandbox only affects commands Claude runs: your own terminal and Docker Desktop are not
sandboxed. Whether a `!` command typed into a Claude Code session is sandboxed was not tested, so
push from your own terminal.

Verified inside the sandbox:

| Operation | Result |
|---|---|
| Frontend `npm test`, `npm run lint`, `npm run build` | 1,774 passed; clean; clean |
| Backend `npm test` and `npx tsc --noEmit` | 630 passed, 1 skipped; clean |
| Vite dev server | serves the app |
| Backend dev server (`tsx watch`) against PostgreSQL on localhost | `/health` reports the database up, and a login returns 200 |
| `psql`, git, `codegraph`, `npm ping` | work. The documentation commit of this pass was made from inside the sandbox |
| `docker context ls`, `docker version` (excluded) | work, server 29.8.0 |
| The U-09 browser checks, against an already running Chrome | 12 of 12 |
| GateGuard and the other hooks | still fire: hooks run outside the sandbox |
| A write outside the project | blocked ("Operation not permitted") |
| A host nobody approved, and the Docker socket | blocked |

These need to run outside the sandbox. Claude retries them with `dangerouslyDisableSandbox`,
which the auto-mode classifier reviews:

- **npm downloads:** `npm install`, `npm view`, and `npx` with a package that is not in
  `node_modules` all fail, because npm cannot write its cache in `~/.npm`.
  - npm's error then suggests a `sudo chown` of `~/.npm`. Do not run it: the cause is the
    sandbox, not file ownership.
  - Tools already in `node_modules`, such as `npx tsc` and `npx prettier`, are not affected.
- **Processes:**
  - launching headless Chrome for browser QA, which does not start inside the sandbox;
  - stopping a process that another command started (`kill`, `pg_ctl stop`). Background tasks can
    still be stopped with Claude's TaskStop.
- **SSH (not tested):** `git fetch` and `git push` over SSH, which means the `gitlab` remote and
  the GitLab push URL of `origin`. The sandbox cannot read `~/.ssh`, and SSH does not go through
  the proxy. You do the pushes anyway.
- **Also blocked inside the sandbox:** `open`, `osascript`, `ps`, `pgrep`, and zsh process
  substitution `<(…)`.

What the sandbox does not cover:

- **Claude's own tools:** the Read, Edit and Write tools, WebFetch, MCP servers such as codegraph,
  and hooks follow the permission rules, not the sandbox.
- **Excluded commands and approved escapes:** Docker, and any command approved to run outside,
  run with your full access.
- **The local database:** a sandboxed command can still connect to the development database over
  localhost, and could change or drop data with SQL. The rules match `dropdb` and
  `prisma migrate reset`, not SQL text.
- **Approved hosts:** an approved host is approved as a whole. The proxy checks the host name, not
  what is sent to it.
- **Allow rules approve the escape too:** an allow rule also approves running the same command
  outside the sandbox. So the commands this project allows (`npm run`, `npx tsc`, `npx vite`,
  `npx prisma`) can leave the sandbox without review. See decision 1 below.

### Sidebar layout: stays in browser storage

The backend has nowhere to keep a per-user preference:
- `users` and `profiles` hold identity fields only, with no JSON or settings column.
- There is no preferences endpoint.
- The only JSON settings are on `boards` (`view_tabs` and `view_settings`). Every member of a
  board shares those, so storing the layout there would change the sidebar for everyone.

Making the layout follow you across devices would need three new things: a column or table,
which means a migration; an endpoint; and a rule for merging edits from two devices made at the
same time.

As you instructed, the current implementation stays. The layout is stored per account and per
browser, under `sidebar:layout:<userId>` in `localStorage`. It is private to that account in that
browser and has no effect on anyone else.

**The limitation:** a second browser or device, or a browser whose site data was cleared, starts
from the default sidebar. The dialog text from the brief, "These changes affect only your
account.", did not say so; since ae3d548 it does (see the third pass).

### AgentShield, second run

This run used the same version (1.6.0) and the same target (the repository) as this morning's.

- **Score:** grade D, 56/100, as this morning; permissions 81. It now lists four recognised
  defences: the deny list, the ask list, the sandbox and the MCP allow list. It credits them but
  does not score them.
- **Critical findings:** up from 483 to 939. All of the difference is "Azure storage keys" in
  `backend/package-lock.json`, which this run scanned for the first time, although the file has
  not changed since 2026-11-04. There are 456 of them, one per `integrity` hash: the same false
  positive as the root lockfile.
- **Everything else:** identical to this morning's findings.
- **The four "missing deny rule" findings:**
  - `rm -rf` and `sudo` ask instead of deny, as you asked.
  - `chmod 777` is denied, but the scanner looks for that literal text and does not read
    `chmod *777 *`.
  - `> /dev/` is left to the sandbox, because a deny rule would also block `2>/dev/null`.

### Verification on the final tree (99f3dea)

| Check | Result |
|---|---|
| Frontend tests, lint and build, inside the sandbox | 1,774 passed in 121 files; clean; clean |
| The same three on an export of `HEAD` alone, without your uncommitted files | 1,774 passed; clean; clean |
| Backend tests and typecheck | 630 passed and 1 skipped; clean. No backend file changed |
| U-09 in headless Chrome | 12 of 12; 8 of 12 on the old code |
| Review of all nine commits | No file outside `src/` and `docs/`, none of your five files, no debug output or lint suppressions, and the i18n keys match in en, ru and uz |
| Your five files | SHA-256 checksums match |

### Decided in your second review

You approved all four:
- every escape from the sandbox asks you;
- npm installs are never approved automatically;
- the rules and the sandbox move to your user settings;
- the dialog text says the layout is saved in this browser.

The next section records what was done. U-07 and U-08 are still open.

## Third pass: your four decisions (2026-11-06)

The one code change is ae3d548. Everything else is Claude Code configuration on this Mac, which no
commit contains.

### Where each rule lives now

**`~/.claude/settings.json` applies to every project.** It now holds:
- the 33 deny rules, unchanged from the second pass;
- the ask list from the second pass, with three additions:
  - `Bash(dangerouslyDisableSandbox:true)`. Every command that Claude retries outside the sandbox
    asks you first. Claude Code's documentation says this rule "takes precedence over a matching
    allow rule", so an allow rule such as `npm run *` can no longer approve an escape silently.
  - npm commands that change dependencies:
    - `npm *install*`, which also matches `uninstall`, `clean-install` and
      `npm --prefix backend install`;
    - `npm i`, `npm add` and `npm ci`;
    - `npm update` and `npm up`;
    - `npm remove`, `npm rm` and `npm un`;
    - `npm dedupe`, `npm prune`, `npm link` and `npm audit fix`.
  - `Edit(.claude/settings*.json)`, which protects the Claude Code settings of any project.
- the sandbox block, unchanged.

Every key that was there before is byte-for-byte the same:
- the three hooks;
- the plugins (GateGuard comes from the enabled `ecc` plugin);
- `autoMode`;
- the model settings;
- the status line.

A `jq` comparison against the backup differs only in `ask`, `deny` and `sandbox`.

**`.claude/settings.local.json` applies to this project only.** It keeps:
- its allow list, unchanged;
- `Edit(/backend/prisma/migrations/**)`;
- `Edit(/.claude/settings*.json)`, the form anchored to this project, for its own file;
- the codegraph MCP server.

**Backups,** both byte-identical to the files before this pass:
- `~/.claude/settings.json.pre-security-2026-11-06.bak`
- `~/.claude/projects/-Users-onesadboy-Documents-TODO-app/settings.local.json.2026-11-06-round2.bak`

Normal work still runs without a prompt: `npm test`, `npm run lint`, `npm run build`,
`npm run dev`, `npx tsc`, and `npx prisma` apart from its asked and denied subcommands.

### What changes in other projects

- **The sandbox and every deny and ask rule now apply in all your projects.** There too, an
  install, a cache written outside the project, or launching an app hits the sandbox, and each
  retry outside it asks you.
- **yarn, pnpm and bun have no ask rules.** Their installs write caches outside the project, so
  the sandbox refuses them and the retry asks you.
- **A project can still turn the sandbox off for itself.**
  - For a single value such as `sandbox.enabled`, project settings override user settings. So a
    repository whose `.claude/settings.json` sets `"sandbox": {"enabled": false}` disables it
    there.
  - Only managed settings, which an administrator installs for the whole machine, can prevent
    that.
  - A project cannot loosen the deny and ask rules, because its allow rules never beat yours.
- **`~/.claude/settings.local.json` is the project file of your home folder.** It applies only
  when Claude Code starts in `~`. Its `Bash(git *)` allow no longer approves `git push` or
  `git stash` there, because your user-level ask and deny rules win.
- **`.claude/hooks/comment-guard.mjs` in this repository does not run.** No settings file refers
  to it. It was already like that, and it was not touched.

### Verification

| Check | Result |
|---|---|
| Both settings files | Valid JSON, and Claude Code picked up each change without a restart |
| The edit to `~/.claude/settings.json` | Prompted you, as you confirmed |
| `npx tsc --version` retried outside the sandbox | Prompted you, as you confirmed. Before this pass, the project's `npx tsc *` allow would have approved it silently |
| `npm install --dry-run` | Prompted you, as you confirmed |
| Deny rules, now only in your user settings | `git stash list`, `chmod 777` and reading `~/.ssh` were refused. `npx prisma migrate reset` was refused although the project allows `npx prisma *` |
| The sandbox, now enabled from your user settings | A write outside the project fails with "Operation not permitted". Docker, which runs outside the sandbox, still works |
| GateGuard | Still blocks the first edit of each file: denials #33 to #36 came after the change |
| Dev servers, inside the sandbox | Vite serves the app. The API starts under `tsx watch` and answers `/health` |
| Frontend tests, lint and build | 1,774 passed in 121 files; clean; clean |
| The same three on an export of ae3d548 alone, without your uncommitted files | 1,774 passed; clean; clean |
| Backend tests and typecheck | 630 passed and 1 skipped; clean |

Not verified in this pass:

- **The sandbox's own read block.** The auto-mode classifier refused my probe script as an attempt
  to get around the Read deny rules, so I did not try another way. The block was verified in the
  second pass, and it is built from the same deny rules. `/sandbox` shows the active
  configuration.
- **The API reaching a database.** None was running:
  - Docker was stopped.
  - The scratch PostgreSQL cannot start inside the sandbox, which blocks the System V shared memory
    it needs.

  In the second pass, with the same sandbox configuration, the API reached PostgreSQL over
  localhost.
- **Another project, live.** That needs a separate Claude Code session, which I did not start from
  inside this one. What I checked instead: there are no managed settings on this Mac, so a new
  project loads only `~/.claude/settings.json`, and that file names no Veylo path. To see it
  yourself, run `mkdir -p /tmp/cc-probe && cd /tmp/cc-probe && claude`, then `/permissions` and
  `/sandbox`.

### AgentShield, third run

AgentShield scans one folder, and the rules now live outside the repository, so there were two
scans.

- **The repository:** grade D, 57/100 (56 before); permissions 85 (81 before).
  - One finding is new since the second run: "No deny list configured" (high) for
    `.claude/settings.local.json`, because the deny list moved to your user settings.
  - The four "missing deny rule" findings went with it.
  - Everything else is identical.
- **A copy of `~/.claude/settings.json` on its own:** grade B, 89/100; permissions 43. It
  recognises the deny list, the ask list and the sandbox. What it reports:
  - the same four "missing deny rule" findings as before;
  - "No PreToolUse security hooks", because GateGuard is a plugin hook and the scanner reads only
    the settings file;
  - three settings you already had:
    - the status-line command, rated critical because the scanner flags any command run at
      startup;
    - `defaultMode: auto`;
    - `skipDangerousModePermissionPrompt`.

### Branch and release strategy

Nothing was merged, rebased or rewritten. Where things stand:

- `main` and `origin/main` are both 72b498b, from 2026-10-16. The last fetch was on 2026-10-19.
- History is one straight line with no merge commits:
  1. `main`;
  2. `release/2026-10-17` (06f2532), 7 commits later;
  3. `1b6e53f`, 30 commits after that. It is pushed as `origin/hardening/audit-2026-11`, and
     production has run it since 2026-11-05;
  4. this branch, 12 commits after that, never pushed.
- So `main` lacks the 37 commits that production already runs, as well as these 12.

The safest order:

1. Run `git fetch origin` to confirm that `origin/main` has not moved.
2. Open PR 1, from `hardening/audit-2026-11` to `main`. It is exactly what production runs.
   - Merge it as a fast-forward or with a merge commit.
   - Do not squash or rebase it. Either would give the deployed commits new SHAs, and `main`
     would no longer contain the commit that production runs.
   - Tag `1b6e53f` as the deployed version.
3. Push this branch with `git push -u origin feature/ui-quality-pass-2026-11`. `origin` pushes to
   both GitHub and GitLab.
4. Open PR 2, from this branch to `main`, once PR 1 is merged, so that it shows only these 12
   commits. Before then, basing PR 2 on `hardening/audit-2026-11` gives the same view.
5. Merge PR 2 the same way as PR 1.
6. Deploy the tip of `main` by the usual procedure, with images built on the Mac and never on the
   EC2 host, and tag it.

Your five uncommitted files stay out of both PRs.

A single PR from this branch to `main` would carry 49 commits: 37 that are already deployed and
12 new ones. Neither a review nor a rollback could tell them apart.

### For your decision

Only the optional U-07 and U-08 cleanups are still open.

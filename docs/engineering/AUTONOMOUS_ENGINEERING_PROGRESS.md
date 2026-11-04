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

## Baseline

The 2026-11-03 baseline on `06f2532`: 1,730 frontend, 622 backend unit and 974 backend
integration tests, lint and both typechecks all clean.

Integration tests run against a throwaway PostgreSQL 17 cluster on port 5544 in the session
scratchpad (`todo_app_test`, all 42 migrations). Browser checks use a seeded scratch database
(`veylo_qa`) on the same cluster, the working-tree API on port 4310, and a small Node stand-in
for the frontend nginx that sends the exact `add_header` values parsed from `nginx.conf`.
Docker was unresponsive on this machine for most of 2026-11-04. It answered briefly from
15:59 UTC, long enough for `nginx -t`, both image builds and the image checks, and then froze
again (see F-28).

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
| F-28 | P3 | Container hardening | BLOCKED (shadcn move done; `USER node` builds and the image runs as uid 1000, but running the stack froze Docker Desktop, so it stays uncommitted; the MinIO pin needs the server's version, and SSH still times out; the MinIO image can no longer be pulled) | 466104c |
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
- `USER node`: not committed. Docker was retried at 14:05–14:20 UTC on 2026-11-04, after you
  said it was being prepared, and was still unavailable:
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
  - Not run: starting the stack, migrations and `/health` as uid 1000, attachment and avatar
    round trips, the MinIO secret-change rehearsal, `nginx -t` inside the frontend container,
    and the Docker smoke test. Right after `compose up` sent its first two calls (16:39:45 UTC),
    Docker Desktop's `com.docker.backend` stopped logging altogether: its `GET /time` heartbeat
    stopped too, at 0% CPU, and `/_ping` timed out again. That process was started 15 days ago.
    The engine restart replaced only the VM, so a full Quit and reopen of Docker Desktop is
    what replaces it.

  Without Docker, the closest check was run: the image's runtime contents (`node_modules`,
  `dist`, `prisma`, `prisma.config.ts`, `package.json`, from a clean `npm ci` of this branch)
  copied into a directory made read-only, which is how root-owned `/app` looks to the `node`
  user. From it, `npm run db:migrate` applied all 43 migrations to a fresh database, and
  `node dist/server.js` started, answered `/health` and registered an account, with no
  permission errors. That is macOS, not the Alpine image, so it does not replace the build.
- The change, once Docker works: add `USER node` before `ENTRYPOINT` in `backend/Dockerfile`.
  Build and run it as a separate project, never as `todo-app` (see step 4 of Remaining
  production actions). Then check:
  - `id -u` in the backend container is 1000;
  - its log shows `migrate deploy` and "listening";
  - `/health` answers;
  - an attachment uploads and downloads byte for byte, and an avatar uploads;
  - `ops/smoke-browser.mjs` passes.

  The change is ready in a scratch clone, uncommitted.
- MinIO: the copy of `quay.io/minio/minio:latest` cached on this machine is
  `RELEASE.2025-09-07T16-13-09Z` (digest `sha256:14cea493…936e`, built 2025-09-07). It was not
  run against the branch: the stack never started.
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
| Stack run as uid 1000, attachments and avatars, MinIO secret-change rehearsal, Docker smoke | not run: Docker Desktop froze again at 16:39:45 UTC (F-28) |

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
4. Build and start the release candidate locally and run `ops/smoke-browser.mjs` against it.
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
   effect with this `up`.
7. Afterwards: add `Strict-Transport-Security` on the host nginx; install `ops/backup.sh` in
   cron with the weekly off-machine copy, and run `ops/restore-check.sh` once (F-10); point a
   free uptime monitor at `https://veylo.work.gd/health` (F-15).
8. F-28: pin MinIO to the version read in step 0. Add `USER node` once a running stack passes
   the checks under F-28. The build and the image's permissions already pass.

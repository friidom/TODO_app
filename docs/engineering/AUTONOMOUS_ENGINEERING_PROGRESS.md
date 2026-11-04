# Autonomous engineering progress

Source: the engineering audit of 2026-11-03 (30 findings, F-01 to F-30), run against
`release/2026-10-17` at `06f2532`, which is what production runs. Work happens on the
local branch `hardening/audit-2026-11`. Nothing is pushed or deployed.

Five files were already uncommitted on the release branch before this work (`seed-qa.ts`, its
`db:seed-qa` line in `backend/package.json`, `SprintControls.tsx`, `ThemeProvider.tsx` and
`oauthApi.ts`). They are left exactly as found and appear in no commit.

## Baseline

The 2026-11-03 baseline on `06f2532`: 1,730 frontend, 622 backend unit and 974 backend
integration tests, lint and both typechecks all clean.

Integration tests run against a throwaway PostgreSQL 17 cluster on port 5544 in the session
scratchpad (`todo_app_test`, all 42 migrations). Browser checks use a seeded scratch database
(`veylo_qa`) on the same cluster, the working-tree API on port 4310, and a small Node stand-in
for the frontend nginx that sends the exact `add_header` values parsed from `nginx.conf`.
Docker was unresponsive on this machine, so `nginx -t` could not be run (see Remaining
production actions).

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
| F-20 | P2 | Release hygiene | BLOCKED (your decision on your five files; fast-forwarding main needs a push) | |
| F-21 | P3 | No cleanup of sessions and tokens | COMPLETED | 55f590d |
| F-22 | P3 | Workflow transition check can be raced | COMPLETED | f92a7bb |
| F-23 | P3 | No grace window on refresh rotation | BLOCKED (changes reuse detection; needs your decision) | |
| F-24 | P3 | Board page JavaScript weight | COMPLETED | 1ed72de |
| F-25 | P3 | Done grows without limit | BLOCKED (product decision: default for hideDoneAfter) | |
| F-26 | P3 | Hand-styled buttons | NOT_APPLICABLE as a task (adopt when touched, per the audit) | |
| F-27 | P3 | Very large components | NOT_APPLICABLE as a task (split when touched, per the audit) | |
| F-28 | P3 | Container hardening | BLOCKED (shadcn move done in 466104c; `USER node` needs a Docker build, the MinIO pin needs the server version) | |
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
  overrides `env_file`, so a value there would beat the server's `backend/.env`. The production
  logs' `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` warning shows the host nginx already sends
  X-Forwarded-For, which is what 2 relies on.

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

The five pre-existing files are your deliberate, unreleased work, so committing, dropping or
splitting them is your call. Fast-forwarding `main` to the release needs a push, which this work
does not do.

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

### F-23: refresh grace window (blocked)

A grace window changes how reuse of a rotated refresh token is treated, which is part of the
authentication architecture this mission was told to preserve. An implementation was started,
then reverted before commit so you can decide on it. Nothing in the repo changed for F-23.

### F-24: board page weight

`BoardPage.tsx` lazy-loads Summary, Calendar, Timeline, Backlog and Sprint insights, with the
existing per-view skeleton as the fallback; `BoardActions.tsx` lazy-loads the two workflow
editors. The board and the List stay in the chunk. BoardPage went from 530 KB / 141 KB gzipped to
290 KB / 77 KB. In headless Chrome every view and Manage workflows loaded its chunk and rendered
with no errors.

### F-25: Done grows without limit (blocked)

The audit said to "consider" defaulting `hideDoneAfter` to 14 days. That changes what every board
without sprints shows, so it is a product decision; it is one value in
`src/services/views/boardViewPrefs.ts:86`. Pagination is not needed at today's size, as the audit
says.

### F-26 and F-27: buttons and large components

The audit describes both as work to do when a file is touched for another reason ("No sweeping
refactor", "This is not a task on its own"). `ui/button.tsx` already has cva variants. A sweep
across 293 buttons or a split of five large components with no component tests would add
regression risk for no functional gain, so neither was done as a task.

### F-28: container hardening (blocked)

- Done: the shadcn CLI is now a devDependency (466104c).
- Blocked: `USER node` in `backend/Dockerfile` has to be checked with a real `docker build` and a
  start, because the entrypoint runs `prisma migrate deploy`, which may write caches under the
  root-owned `node_modules`. Docker was unresponsive on this machine, and a broken entrypoint means
  an API outage at deploy.
- Blocked: pinning `quay.io/minio/minio` needs the release the server runs today
  (`sudo -n docker inspect todo-minio --format '{{.Config.Image}} {{.Image}}'`), because pinning
  an older one would downgrade MinIO's data.

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

On a fresh database with all 43 migrations applied (`final_check_test` on the scratch cluster):

| Suite | Result |
|---|---|
| Frontend `npm test` | 1,746 passed (120 files) |
| Frontend `npm run build` (tsc -b + vite) and `npm run lint` | clean |
| Backend `npm run build` (tsc) | clean |
| Backend unit | 630 passed, 1 skipped (42 files) |
| Backend integration | 991 passed, 1 skipped (52 files) |

3,367 tests pass against the 3,326 baseline, and none was removed. Two existing tests that pinned
the old behaviour were changed on purpose: the SVG-inline unit test (F-05) and the "every user,
scoped or not" leaderboard test (F-04). Both changes are explained above.

### Unrelated issue found

`gitlab.webhook.int.test.ts` failed one run in three: `linkStatus` compares millisecond
timestamps, and a failure recorded in the same millisecond as the token save reads as already
fixed. Only the test was affected, so it now waits 2 ms after linking (commit ac98041). Six
consecutive runs passed.

## Remaining production actions

These need a person with server access. None has been done.

1. Before deploying, run the audit's F-02 checks on the server. If the MinIO secret is the
   default, rotate it first, or this build refuses to start.
2. Add `TRUST_PROXY=2` to the server's `backend/.env`, then `up -d --no-deps backend`
   (`env_file` is read when the container is created).
3. Before deploying, check `nginx.conf` with
   `docker run --rm --add-host backend:127.0.0.1 -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t`.
4. Add `Strict-Transport-Security` on the host nginx.
5. This branch changes `docker-compose.yml` (log caps), and the server keeps a local edit of
   that file. Deploy with `git stash`, `git merge --ff-only`, `git stash pop`, and check the
   result with `docker compose config`.
6. Install `ops/backup.sh` in cron, set up the weekly off-machine copy, and run
   `ops/restore-check.sh` once (F-10).
7. Point a free uptime monitor at `https://veylo.work.gd/health` (F-15).
8. Run `ops/smoke-browser.mjs` against the release candidate under `docker compose up --build`
   (F-19), and run `nginx -t` (step 3) at the same time.
9. Migration 0043 runs on deploy (the entrypoint runs `migrate deploy`); take the usual
   pre-deploy `pg_dump` first.
10. Decide on F-20, F-23 and F-25, and on the two blocked parts of F-28.

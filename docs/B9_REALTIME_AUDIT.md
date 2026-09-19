# B9-A Realtime Audit

**Date:** 2026-09-19 · **Commit:** `24a8579` · **Scope:** audit only — nothing implemented, no schema
touched, no dependency added.

---

## 1. Executive summary

Five findings, in the order they change the plan.

**1 — Realtime is not "still on Supabase". It has been dead since B8.**
`useBoardRealtime` still mounts on every board page, but it cannot deliver an event and has not been
able to since the frontend migrated. Two independent reasons, either of which is sufficient:

- **No session.** `grep -rn "supabase\.auth" src/` returns nothing. B8 moved auth to Express, and the
  Supabase client is now constructed with the publishable (anon) key and never told about a user.
  `postgres_changes` is authorized by RLS against the connection's JWT; as `anon`,
  `accessible_board_ids()` returns the empty set, so every row is filtered out server-side.
- **No source.** The rows are in the Dockerized `postgres:18`, not in a Supabase project. Nothing
  writes to the database that replication stream reads.

`.env.example` ships `VITE_SUPABASE_URL=https://placeholder.supabase.co`, so by default the socket
does not even resolve: `subscribe()` reports `CHANNEL_ERROR`/`TIMED_OUT`, the handler clears
`viewers`, `PresenceStack` returns `null`, and the board looks exactly as it does now. **The feature
fails silently and always.**

Consequence for planning: B9 is a **re-implementation, not a migration**. There is no working
behaviour to regress, and the "two browsers" rows in `REALTIME_VERIFICATION.md` can no longer be run
against the old system for comparison. The upside is that B9 can land incrementally without a flag.

**2 — The client-side blast radius is one file.**
`events.ts` (92 lines) and `presence.ts` (31 lines) are pure, transport-agnostic and carry **45
passing tests**. Only `useBoardRealtime.ts` (223 lines) names Supabase. Everything else — the cache
functions, the query keys, `PresenceStack`, `BoardPage` — is already transport-neutral.

**3 — The service layer is already the declared home for emits.**
`backend/src/modules/CONVENTIONS.md` lists "business rules, transactions, **realtime emits**" as the
service layer's responsibility. B9 does not need a new architectural seam; it needs to fill one that
was reserved in B6.

**4 — Two classes of write the service layer cannot see.**
`activities` and `notifications` are written by **database triggers** (`todos_log_activity`,
`columns_log_activity`, `board_members_log_activity`, `todos_notify_assignment`,
`board_invites_notify` — `0006_functions_triggers`). A controller that finishes a todo update has no
idea a notification row appeared. Replication broadcast those for free; explicit emits will not.
Separately, several services write **many rows in one call** (column delete, sprint start/complete,
rebalance), which replication broadcast as N events.

**5 — The Docker edge is not WebSocket-ready and not SSE-ready.**
`nginx.conf` sets `proxy_http_version 1.1` but no `Upgrade`/`Connection` headers, so a WS handshake
through `http://localhost:3000` returns 400. `proxy_buffering` is on by default, which would hold SSE
frames. Whatever transport is chosen, **`nginx.conf` is part of B9**, or realtime works in `npm run
dev` and is broken in the one-command Docker demo.

Recommendation, in one line: **Socket.IO over the existing Express HTTP server, service-layer emits
after commit, presence in memory, `LISTEN/NOTIFY` deliberately deferred with a named trigger.**
Reasoning in §14.

---

## 2. Complete realtime inventory

Everything in the repository that touches realtime. There is no second subscription anywhere.

| File | Lines | Role | Supabase-specific? |
|---|---:|---|---|
| `src/services/realtime/useBoardRealtime.ts` | 223 | the only subscription; one channel per board | **yes — entirely** |
| `src/services/realtime/events.ts` | 92 | payload → cache transformation | no |
| `src/services/realtime/presence.ts` | 31 | presence state → viewer ids | shape only |
| `src/services/realtime/events.test.ts` | 455 | 34 tests | no |
| `src/services/realtime/presence.test.ts` | 107 | 11 tests | no |
| `src/pages/board/BoardPage.tsx:47` | — | the single call site | no |
| `src/components/layout/BoardIdentity.tsx:105` | — | passes `viewers` down | no |
| `src/components/board/PresenceStack.tsx` | 50 | renders the avatars | no |
| `src/services/api/supabase.ts` | 21 | the anon client | yes (also B10's) |
| `supabase/migrations/20260818090000_realtime_publication.sql` | — | historical: `todos`, `columns` | yes — **not applied** |
| `supabase/migrations/20260818110000_realtime_comments.sql` | — | historical: `comments` | yes — **not applied** |
| `docs/REALTIME_VERIFICATION.md` | 312 | M6-B verification record + 1 open finding | — |

**Backend: zero.** A word-boundary grep for `ws|socket.io|WebSocket|EventSource|text/event-stream|LISTEN|NOTIFY|pg_notify`
across `backend/src/` returns nothing. No transport, no emitter, no room registry.

**Not realtime today, and worth naming so the plan does not assume otherwise:** sprints, attachments,
members, invites, boards, spaces, profiles, activities, notifications, the For You feed.

---

## 3. Event map

One channel, `board:${boardId}`, with **ten bindings**: three tables × three events, plus presence.

| # | Table | Event | Server filter | Handler | Cache write |
|---|---|---|---|---|---|
| 1 | `todos` | INSERT | `board_id=eq.<id>` | `patchTodos` | `queryKeys.todos(boardId)` |
| 2 | `todos` | UPDATE | `board_id=eq.<id>` | `patchTodos` | same |
| 3 | `todos` | DELETE | **none** | `patchTodos` | same |
| 4 | `columns` | INSERT | `board_id=eq.<id>` | `patchColumns` | `queryKeys.columns(boardId)` |
| 5 | `columns` | UPDATE | `board_id=eq.<id>` | `patchColumns` | same |
| 6 | `columns` | DELETE | **none** | `patchColumns` | same |
| 7 | `comments` | INSERT | `board_id=eq.<id>` | `patchComments` | `queryKeys.comments(todo_id)` |
| 8 | `comments` | UPDATE | `board_id=eq.<id>` | `patchComments` | same |
| 9 | `comments` | DELETE | **none** | `patchComments` | prefix scan over `queryKeys.commentThreads()` |
| 10 | — | `presence` `sync` | — | inline | `useState` — **never the query cache** |

**Why DELETE is unfiltered.** The tables are `REPLICA IDENTITY DEFAULT`, so a delete payload carries
the primary key only. A `board_id` filter on a column that is not in the payload can never match, so
filtered deletes would simply never arrive. The client subscribes unfiltered and reconciles by id: an
id from another board is a no-op against this board's array.

**Comment DELETE is the one prefix scan.** With only `{ id }` on the wire there is no `todo_id` to
key on, so the handler walks every `["comments", …]` entry, finds the thread holding that id, writes
it and breaks. Any replacement transport should send `todo_id` on a comment delete and let this
degrade to a direct key — see §12, R3.

**Three flows, source → UI, end to end:**

```
another client PATCHes a card
  → Postgres WAL → supabase_realtime publication → Realtime server (RLS per subscriber)
  → "postgres_changes" UPDATE, filter board_id=eq.X
  → patchTodos → applyTodoEvent → applyTodoUpdated (services/todos/cache.ts)
  → queryClient.setQueryData(["todos", X])
  → useVisibleTodos re-runs → every view re-renders (board, list, calendar, timeline, backlog, summary)

another client posts a comment
  → … "postgres_changes" INSERT on comments, filter board_id=eq.X
  → patchComments → applyCommentEvent → applyCommentInserted (posting order)
  → setQueryData(["comments", todo_id]) → CommentThread re-renders if that task is open

a tab opens the board
  → channel.track({ user_id, at }) → Phoenix presence diff → "presence" "sync"
  → viewersFrom(presenceState) → sameViewers guard → setViewers
  → BoardPage → BoardIdentity → PresenceStack (joins ids to the roster for faces)
```

---

## 4. Presence

- **Mechanism:** Phoenix presence inside the same channel. `config.presence.key = userId`, and
  `enabled: true` is set explicitly because realtime-js only requests the initial snapshot when it is
  set or a presence binding already exists at `subscribe()` time.
- **Write:** `channel.track({ user_id, at })`, called from the `SUBSCRIBED` branch — so it re-runs on
  every reconnect.
- **Read:** the `sync` event only. Phoenix's `onSync` fires after the initial state *and* after every
  diff, so `join`/`leave` bindings would be redundant.
- **Reduction:** `viewersFrom(state)` — a `Record<presenceKey, PresenceMeta[]>` → a sorted, deduped
  `string[]`. Two decisions are pinned by tests: **self is included** (excluding it made a two-person
  board show one avatar each), and the result is **sorted** rather than arrival-ordered, because
  presence has no stable cross-client ordering and avatars would reshuffle on reconnect.
- **Multi-tab:** the array-per-key shape is exactly this. One person with three tabs is three entries
  under one key and **one** viewer.
- **Render guard:** `sameViewers` returns the previous array when the roster is unchanged, so React
  bails out. Presence heartbeats fire far more often than the roster changes; without this the whole
  board repaints on each one.
- **Storage:** none. No table, no cache entry, no fallback to the member roster. A closed tab is
  simply not present — which is why the feature degrades to "nothing shown" rather than to "stale
  avatars" when the socket is down.
- **Consumer:** `PresenceStack` shows three faces plus `+N`, joining presence ids to
  `useBoardMembers` purely for avatars and names. A present user the roster has not caught up with
  renders as `–`/"Someone" rather than disappearing.

---

## 5. Broadcast

**Not used anywhere.** No `channel.send`, no `.on("broadcast", …)`. Every live path is either
`postgres_changes` or presence. Nothing in B9 has to reproduce a broadcast behaviour.

---

## 6. Postgres changes

- **Publication:** `supabase_realtime`, a named-table publication (not `FOR ALL TABLES`), holding
  exactly `public.todos`, `public.columns`, `public.comments`. Adding a table was written as a
  deliberate act; `boards` was considered and left out ("a board rename is not something a second
  client needs within a second").
- **Replica identity:** `DEFAULT` on all three, and the migration header records this as a **security
  decision**, not an oversight. Under `FULL`, the old row — title, description, assignee — would ride
  on DELETE payloads, and Realtime does not apply RLS to a DELETE the way it does to INSERT/UPDATE.
  `DEFAULT` puts a uuid on the wire: it identifies a row without describing it.
- **Column list:** none, argued rather than forgotten. RLS here is row-level, whole rows are decided
  by `accessible_board_ids()`, and the board query already returns `select("*")` to any member — so
  every column a client receives is one it could have selected. A list would add a coupling and buy
  nothing.
- **Status in the new stack:** `supabase/migrations/` is historical and applied by nothing. The
  Prisma schema has **no publication and no logical replication**, and `docker-compose.yml` runs
  stock `postgres:18` at the default `wal_level = replica`. Reproducing CDC would mean
  `wal_level = logical`, a replication slot and a consumer process. See §13.

---

## 7. Authorization / security

This is where B9 is most exposed, because B6 replaced a mechanism that applied itself.

**What RLS did for free.** The Realtime server evaluated each subscriber's JWT against the row's
policy *per event*. A member removed mid-session stopped matching. No application code was involved.

**What replaces it.** `requireAuth` → `boardAccess()` → `requireRole(...)`, all HTTP-request-shaped.
`roleOf(boardId, userId)` is the membership lookup; `accessibleBoardIds` is the single swap point.
**None of it runs on a long-lived connection.**

The four requirements from `REALTIME_VERIFICATION.md` §M6-07, re-stated against a socket:

| # | Requirement | Under Supabase | Under B9 |
|---|---|---|---|
| 1 | a non-member receives no events for a board | RLS, per event | **join-time `roleOf` check**, explicit |
| 2 | a viewer receives events but gains no write affordance | RLS + pure handlers | unchanged — `events.ts` writes no database and consults no permission |
| 3 | a member removed while subscribed stops receiving | ~token lifetime, **never measured** | **must be built: forced eviction** |
| 4 | no payload exposes a column the client could not select | row-level RLS, argued | **now a property of what the emitter selects** |

**Requirement 3 is the one that gets worse before it gets better.** Today the window is bounded by
whatever the Realtime server does on reconnect — unmeasured, but bounded by something. A socket
authorized once at join time and never re-checked has an **unbounded** window: a removed member keeps
receiving the board's traffic until they close the tab. A join-time check alone is a regression.
Eviction on `DELETE /members/:id` and on role change must land in the same milestone as the join
check, not after it.

**Requirement 4 changes character.** It stops being an argument about RLS and becomes an invariant
about emit code: *the emitted payload must be the same projection the board's GET returns.* The cheap
way to guarantee it is to emit the repo's own row type (`TodoDetailRow`, `ColumnRow`, `CommentRow`)
and never hand-build an object at the emit site.

**Token lifetime.** `ACCESS_TOKEN_TTL` is 15 minutes (`backend/src/config/env.ts:71`); refresh is 30
days in an HttpOnly cookie scoped to `Path=/api/v1/auth`. Two consequences:

- That cookie is **not** sent to any path outside `/api/v1/auth`, so a socket endpoint at
  `/api/v1/realtime` cannot authenticate from it. The access token must be presented explicitly.
- `getAccessToken()` is already exported from `client.ts`, so the handshake has a supply. But a
  15-minute token on a connection that should live for hours means the server must decide: accept the
  token once at handshake, or re-verify periodically. Accepting once re-creates requirement 3's
  unbounded window through a second door.

**A leak that is easy to write and hard to see:** presence. The roster of who is on a board is
membership information. `presence:sync` must be emitted **to the room only**, never broadcast, and the
join check must precede the presence add — otherwise a non-member who connects learns who is working
on a board they cannot read.

---

## 8. TanStack Query interaction

- **Writes, never refetches.** Every handler is `setQueryData`. The only `invalidateQueries` on this
  path is the resubscribe resync (§9).
- **Guarded by existence.** `setQueryData(key, old => old ? apply(old) : old)` — the write is skipped
  when the entry does not exist, because creating one holding a single row would look like a fully
  loaded board to any component reading it.
- **Shared transformations.** `events.ts` calls the *same* `applyTodoInserted` / `Updated` /
  `Deleted` / `applyColumnX` / `applyCommentX` functions the mutations use. This is why those live in
  `services/todos/cache.ts` rather than inside the `onMutate` closures: a channel callback cannot
  reach into a mutation. There is exactly one definition of what a move means.
- **Purity is load-bearing.** None of them mutates its input. `onMutate` snapshots the cached array
  for rollback and the cache holds those very objects; renumbering in place would leave `onError`
  nothing to restore.
- **Echo suppression is id-based, not sender-based.** `todos.id` is a client-minted uuid, so an
  INSERT whose id is already in the array is this client's own optimistic write returning. It is
  skipped. An UPDATE for an unknown row is **dropped, not inserted** — it means the INSERT was missed,
  and inventing a row from a partial payload would be worse than waiting for the resync.
  `applyCommentEvent` does *not* skip unknown inserts, because comment ids are server-minted.
- **Downstream.** A `["todos", boardId]` write re-runs `useVisibleTodos` (scope → filter → search →
  sort) and therefore every one of the six views at once. No view subscribes separately.
- **Not on this path:** `activities` is invalidated by `MutationCache.onSuccess` in `queryClient.ts`
  — and note it is spelled `["activities"]` literally there, the one place a key bypasses the factory.
  `notifications` is `refetchOnWindowFocus` plus a refetch on open; the comment records why ("a
  user-scoped channel is a whole second subscription model"). B9 revisits that trade, not that code.
- **Defaults that matter:** `staleTime` 30s, `gcTime` 10min, mutations do not retry. The 30s
  `staleTime` is what makes a missed event survivable — a tab switch is not a refetch, but a remount
  after 30s is.

---

## 9. Lifecycle / reconnect / multi-tab

**Effect keyed on `[boardId, userId, queryClient]`.** One channel per board, created in `BoardPage`
and nowhere else. It does not mount until both a board id and a signed-in user exist.

**Reconnect resync.** The `hasSubscribed` flag distinguishes the first `SUBSCRIBED` from a later one.
On a *later* one, three invalidations fire — `todos(boardId)`, `columns(boardId)`, and the whole
`commentThreads()` prefix — because whatever happened during the gap was never delivered. This is the
single most important behaviour to preserve in B9: it is what makes dropped events recoverable
instead of permanent.

**Drop handling.** `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` clear `viewers`. Presence is
server-authoritative and nothing tells a disconnected client its roster went stale, so showing an old
roster would be a lie.

**Teardown.** `supabase.removeChannel(channel)` — not `unsubscribe()`, which would leave the registry
entry and leak.

**Open finding, carried forward (`REALTIME_VERIFICATION.md:289`).** `RealtimeClient.channel(topic)`
returns the channel already registered for that topic, and `removeChannel` only clears the registry
once the server acks the leave. A board revisited inside that round trip (A → B → A in ~200 ms) binds
onto a channel that is still leaving; `subscribe()` no-ops because it is not `closed`, so the
SUBSCRIBED callback never runs, `track()` never runs, and **the board looks live while being silently
dead until a reload.** Left unfixed deliberately: no route navigates board → board that fast and there
is no StrictMode double-mount to force it.

*This finding does not survive into B9 — a Socket.IO room join has no registry of this kind — but the
class of bug does. The B9 equivalent is join/leave racing on the same socket, and it deserves the same
scrutiny.*

**Multi-tab.** Handled at two layers today, and only one of them is realtime's. Presence dedupes tabs
by key (§4). Auth is separate: `navigator.locks` + a `BroadcastChannel("kan:auth")` in `client.ts`
mean many tabs produce one token refresh. Each tab holds **its own** channel and its own cache. B9
inherits both — N tabs is N sockets, which is fine for WS and is a problem for SSE (§13).

---

## 10. Existing tests

**45 tests, 2 files, all passing** (`npx vitest run src/services/realtime/` → 45 passed, 176 ms).

`events.test.ts` — 34 tests, and unusually strong for this kind of code. Beyond the obvious
insert/update/delete cases it pins: **echo suppression** for both todos and comments, idempotency
under duplicate delivery, a delete id from another board being a no-op, an update for an unknown row
being dropped rather than invented, non-mutation of the input array, out-of-order comment arrival
sorting into posting order, and a five-test **concurrency** block — two clients moving the same card
converging on one winner with no orphan, two clients dragging different cards in one column keeping
both, an update overtaking its insert converging, and a late update not resurrecting a deleted row.

`presence.test.ts` — 11 tests: self included, multi-tab counted once, the same person under two keys
deduped, stable sort, malformed entries survived, and the `sameViewers` render guard including the
identical-roster-new-reference case.

**These tests are the specification of B9's payload contract.** If the new server's events make them
fail, the server is wrong.

---

## 11. Missing tests

The gap is sharply defined: **everything pure is tested, everything stateful is not.**

| Gap | Why it is untested today | B9 |
|---|---|---|
| `useBoardRealtime` itself — subscription, resync, teardown | no React Testing Library, by policy | still hard; a thin extraction helps (§12) |
| the resync branch (`hasSubscribed`) | lives inside the effect | extract the key list as a pure function and test *that* |
| the comment-DELETE prefix scan | lives inside the effect | pure function, directly testable |
| non-member receives nothing | needs two sessions and a socket | **integration-testable in B9** — an upgrade |
| removed member stops receiving | needs a live membership change | **integration-testable in B9** |
| emit-after-rollback broadcasts nothing | no emitter exists | **must be tested** — the rule is only as real as its test |
| multi-row operations reach other clients | replication made it automatic | **must be tested** per operation (§12, R5) |
| presence add/remove/disconnect | lived in Phoenix | in-memory registry — cheap to unit test |
| nginx passes an upgrade | no realtime in Docker yet | manual check, once |

Note the shape of this: three of the four security requirements were **MANUAL** under Supabase because
RLS lives in a server nobody here runs. Under B9 the authorization code is in this repository and
`test:integration` already exists against a real database. **B9 can convert requirements 1 and 3 from
MANUAL to automated**, which is a genuine improvement over what it replaces.

---

## 12. Concrete B9 requirements

Derived from the code above, not from a generic feature list.

**R1 — `events.ts` and `presence.ts` do not change; their 45 tests do not change.**
The payload contract is `{ eventType: "INSERT"|"UPDATE"|"DELETE", new: Partial<T>, old: Partial<T> }`.
If the server's shape forces an edit to `events.ts`, the server is wrong. This is the acceptance test.

**R2 — `useBoardRealtime(boardId: string | undefined): string[]` keeps its signature.**
`BoardPage`, `BoardIdentity` and `PresenceStack` must not be touched.

**R3 — DELETE sends `{ old: { id } }` and nothing more.**
We *could* now send the whole row; don't. It keeps the client and its tests unchanged, and "we send
less than we could" is never a bug. **One exception worth considering:** add `todo_id` to a comment
delete. It is not data the recipient could not read, and it collapses the prefix scan in §3 into a
direct key lookup. If taken, it is an `events.ts`-adjacent change and must be argued against R1.

**R4 — emit after commit, never inside the transaction.**
Emitting inside means a rollback still broadcast, and clients would hold rows the database does not
have with nothing to correct them. Needs a test, not just a convention.

**R5 — every multi-row service emits a coarse `board:invalidate { scopes }` rather than N events.**
The checklist, from the services read in this audit:

| Service call | Rows written | Scopes |
|---|---|---|
| `columns.remove` (rehomes todos first) | 1 + N | `columns`, `todos` |
| `sprints.start` (bulk-assigns a column) | N | `todos`, `sprints` |
| `sprints.complete` (rehomes unfinished) | N | `todos`, `sprints` |
| `todos.remove` (cascades comments, attachments) | 1 + N | `todos`, `comments`, `attachments` |
| `todos.rebalanceColumn` / `columns.rebalance` | N | `todos` / `columns` |
| member add / remove / role change | 1 | `members` (**+ eviction**, R7) |
| board delete | cascade | `boards` |

**R6 — the scope → query-key mapping is a pure, tested function.**
The migration plan says "`useBoardRealtime` already does exactly this on resubscribe, so the handler
exists." That is optimistic: the resync path invalidates a hardcoded trio inline; there is no
`scopes → keys` function anywhere. Write `keysForScopes(scopes, boardId)` next to `events.ts`, test
it, and have the resync path call it too so there is one definition.

**R7 — authorization, three parts, all in the same milestone.**
(a) verify the access token at handshake; (b) `roleOf(boardId, actor)` on join, refuse on `null`;
(c) **force-evict** the user's sockets from the room when their membership is deleted or downgraded.
(c) is not optional polish — without it B9 is *worse* than what it replaces (§7).

**R8 — presence is emitted to the room only, after the join check passes.**

**R9 — decide the presence payload shape deliberately, because it decides the fate of 11 tests.**
Server-reduced `{ viewers: string[] }` is smaller and authoritative, but it makes `viewersFrom` dead
code and deletes its 11 tests. Server-raw `PresenceState` keeps them at the cost of shipping a
map-of-arrays. Recommendation: **send `string[]`, keep `sameViewers` (the render guard is still
needed — the server will re-emit identical rosters), and delete `viewersFrom` in the same commit with
its reasoning recorded.** A silent test-count drop from 45 to 34 should not be a surprise in review.

**R10 — `move` and `remove` currently return `void` / a count.**
`todos.service.move` returns nothing, `todos.service.remove` returns nothing, `columns.service.move`
likewise. An emit needs a payload. Either widen them to return the row, or build the payload from the
validated input — the former is safer (emitting what the repo returned also satisfies §7's
requirement 4).

**R11 — `nginx.conf` gains the upgrade headers, and Docker realtime is verified.**
Also: `server.ts` does not export the `http.Server` that `app.listen` returns; attaching a socket
server means restructuring that file slightly.

**R12 — the activities/notifications trigger gap gets an explicit answer.**
Options: leave activities on `MutationCache.onSuccess` (it works and costs nothing — the plan's
choice, and I agree), and for notifications either emit from the service *after* re-reading, or accept
polling. Do not pretend a service-layer emit sees a trigger's row.

**R13 — no schema change.** Nothing in this audit requires one. `wal_level`, publications and replica
identity are all Supabase-era concerns that do not transfer.

---

## 13. Architecture options

Judged against this repository, not in the abstract.

### Socket.IO

**For.** Rooms are a native `board:${boardId}` fit — the topic already has that exact name. Reconnect
with backoff, heartbeats and the "you just reconnected" signal that §9's resync depends on are all
built in; they are precisely the things `useBoardRealtime` gets free from Supabase today.
Bidirectional by nature, which presence needs (the client must `track` itself). Typed events map onto
the existing payload contract without a translation layer.

**Against.** One server dependency and ~40 KB on the client, in a project whose board chunk size was
enough of a concern to drop the React Compiler over. A protocol on top of WebSocket rather than the
thing itself. A Redis adapter becomes mandatory the day a second backend instance exists — today
there is exactly one container.

### `ws` (native)

**For.** Tiny. No protocol layer. The repo has real precedent for hand-rolling: drag-and-drop is
hand-rolled rather than using `@dnd-kit/sortable`.

**Against.** That precedent does not transfer. DnD was hand-rolled because the library's behaviour was
*wrong* for this board — everything reflowed while dragging. Here, Socket.IO's semantics are exactly
what is wanted; the only objection is weight. Choosing `ws` means writing room routing, a reconnect
policy with backoff, heartbeat/liveness and message framing — and §9 shows the reconnect path is
load-bearing, since the resync on re-subscribe is what makes missed events recoverable. That is three
or four subtle bugs to own in the one place where a bug is invisible (the board looks live and is
dead — the exact failure the M6-B finding describes).

### SSE

**For.** No new protocol at the edge, no handshake, works through ordinary HTTP middleware, and
`EventSource` reconnects by itself.

**Against, and these are repo-specific rather than generic.**

1. **One-directional.** Presence needs an uplink. A POST heartbeat is possible, but that is a second
   mechanism with its own liveness timeout — and presence's whole current value is that it is exact.
2. **`EventSource` cannot set an `Authorization` header.** The access token would go in the query
   string (into access logs and `morgan` output) or need a new cookie — and the refresh cookie is
   deliberately scoped to `Path=/api/v1/auth`, so a new cookie means new CSRF surface.
3. **Six connections per origin on HTTP/1.1.** The Docker edge is nginx over plain HTTP/1.1, and an
   SSE stream holds one connection open permanently. Multi-tab is explicitly supported behaviour here
   — `presence.ts` has a test named "counts one person with two tabs once". At the seventh tab the app
   stops loading. WebSocket is not subject to that limit.
4. `proxy_buffering` must be turned off in nginx or frames are held.

### PostgreSQL `LISTEN/NOTIFY`

**Not a competing option — a different layer.** It carries events *between server processes*; a
browser transport is still required on top. It is worth naming because it solves two things the others
do not: the **trigger gap** (a trigger can `pg_notify` directly, so activities and notifications
become visible to the emitter — and `app.actor_id` is already transaction-local inside those triggers
via `withActor`, so the notification could even carry who did it), and **multi-instance fan-out**,
which is otherwise Socket.IO's Redis adapter.

**Against, today.** One backend container, one Node process — there is nothing to fan out *to*.
`NOTIFY` has an 8000-byte payload ceiling, so large payloads become "id + refetch". It needs a
dedicated `pg` connection held outside Prisma's pool. And it delivers **on commit**, which is
attractive (R4 for free) but only for changes that go through the database — which, here, is all of
them.

**Verdict: defer, with a named trigger** — adopt it when either a second backend instance exists or
notifications need to be live. That is the same discipline the repo already applies to the Redis
adapter and to the React Compiler (`M9-05` as the revisit trigger).

### Logical replication / CDC (reproducing what Supabase actually did)

Listed only to close it off. It would need `wal_level = logical`, a replication slot, a decoding plugin
and a consumer — and then per-subscriber authorization would have to be rebuilt in application code
anyway, because RLS is gone. It reproduces the one property nobody asked for ("a manual `psql` fix
broadcasts") at the highest cost of any option. **No.**

---

## 14. Recommended architecture for this repository

**Socket.IO, attached to the existing Express HTTP server, with service-layer emits after commit and
in-memory presence.**

The reasoning, ordered by how much it depends on *this* repo:

1. **The resync-on-reconnect path is load-bearing and already written** (§9). It is the thing that
   makes a dropped event recoverable rather than permanent, and it needs a reliable "you just
   reconnected" signal with sane backoff. Socket.IO provides that; `ws` means writing it; SSE's
   reconnect exists but cannot carry presence.
2. **Presence is bidirectional and is a first-class feature here**, with 11 tests and a documented
   multi-tab rule. That alone disqualifies SSE as the single transport.
3. **Multi-tab is supported behaviour, and the Docker edge is HTTP/1.1.** SSE's six-connection ceiling
   is a real, reachable failure in this deployment, not a theoretical one.
4. **The topic already has Socket.IO's shape.** `board:${boardId}` is literally the current channel
   name; rooms are a one-line mapping.
5. **`ws`'s weight advantage does not pay for its risk here.** The bug class it buys is the invisible
   kind — a board that looks live and is dead — which this codebase has already been bitten by once
   and written down.

**With three amendments to the plan as written in `BACKEND_MIGRATION_PLAN.md` §13:**

- **`board:invalidate` needs a real handler and a pure `keysForScopes` function** (R6). The plan
  assumes the handler exists; it does not.
- **Forced eviction is part of B9-02, not a follow-up** (R7c). Join-time-only authorization is a
  regression against RLS, not parity with it.
- **The presence payload decision is explicit and costs 11 tests** (R9). Decide it in the milestone,
  not in the diff.

`LISTEN/NOTIFY` is deferred with the trigger written down: **a second backend instance, or live
notifications.** The Redis adapter's trigger is the same first half.

---

## 15. Proposed B9 milestones

Ordered so each step is verifiable on its own, and so the security work cannot be deferred past the
feature that needs it.

| ID | Task | Done when |
|---|---|---|
| **B9-A** | this audit | reviewed |
| **B9-B** | `realtime/io.ts` — attach to the HTTP server, verify the access JWT in the handshake; `server.ts` restructured to expose it | a client connects with a valid token and is refused without one |
| **B9-C** | `realtime/rooms.ts` — `board:join`/`board:leave` with `roleOf` on join, **plus forced eviction** on membership delete/downgrade | integration test: non-member refused; removed member's socket leaves the room |
| **B9-D** | `realtime/presence.ts` — in-memory per-room sets keyed by user id, many tabs per user; emit to the room only | unit tests for add/remove/disconnect; multi-tab counted once |
| **B9-E** | `realtime/emit.ts` — typed emitters producing exactly `{ eventType, new, old }`; DELETE sends `{ old: { id } }` | payloads replay through `events.ts` unchanged |
| **B9-F** | wire emits into `todos`, `columns`, `comments` services, **after commit**; widen `move`/`remove` returns (R10) | test: a rolled-back mutation broadcasts nothing |
| **B9-G** | `board:invalidate` from every multi-write service (R5's table is the checklist) | one test per row of that table |
| **B9-H** | client: `keysForScopes` + rewrite `useBoardRealtime` against Socket.IO, **signature unchanged**; the resync path calls `keysForScopes` too | `events.ts`, `presence.test.ts`'s `sameViewers` block and `BoardPage`/`PresenceStack` untouched |
| **B9-I** | `nginx.conf` upgrade headers; verify realtime under `docker compose up --build` | two browsers on `localhost:3000` see each other |
| **B9-J** | per-user rooms + `notification:new`, **or** an explicit decision to keep polling (R12) | whichever, written down |
| **B9-K** | drop `useBoardRealtime`'s Supabase import; `supabase.ts` then belongs to B10 alone | one importer fewer |
| **B9-L** | `docs/REALTIME_VERIFICATION.md` successor; move requirements 1 and 3 from MANUAL to automated | the §13.7 list, run |

B9-C before B9-D is deliberate: presence leaks the membership roster, so the join check must exist
before anything is emitted to a room.

---

## Appendix — method

**Files inspected (24):**
`src/services/realtime/{useBoardRealtime,events,presence}.ts` and both test files ·
`src/services/api/{supabase,client}.ts` · `src/services/queryClient/{queryClient,queryKeys}.ts` ·
`src/services/notifications/useNotifications.ts` · `src/services/activities/useActivities.ts` ·
`src/pages/board/BoardPage.tsx` · `src/components/board/PresenceStack.tsx` ·
`src/components/layout/BoardIdentity.tsx` ·
`backend/src/{app,server}.ts` · `backend/src/middleware/{boardAccess,requireAuth,rateLimit}.ts` ·
`backend/src/lib/permissions.ts` · `backend/src/modules/members/members.repo.ts` ·
`backend/src/modules/todos/todos.service.ts` · `backend/src/db/withActor.ts` ·
`backend/src/modules/CONVENTIONS.md` · `backend/prisma/migrations/0006_functions_triggers/` ·
the two `supabase/migrations/*_realtime_*.sql` · `docs/REALTIME_VERIFICATION.md` ·
`docs/BACKEND_MIGRATION_PLAN.md` §13 · `docker-compose.yml` · `nginx.conf` · `.env.example` ·
both `package.json`.

**Checks run:** `npx vitest run src/services/realtime/` → **45 passed, 2 files**; targeted greps for
`.channel(` / `postgres_changes` / `presence` / `broadcast` / `removeChannel` across `src/` and
`backend/src/`; a word-boundary grep for
`ws|socket.io|WebSocket|EventSource|text/event-stream|LISTEN|NOTIFY|pg_notify` across `backend/src/`
and `src/` (**no matches**); `grep -rn "supabase\.auth"` across `src/` (**no matches**); trigger
enumeration from `0006_functions_triggers/migration.sql`.

**Not done, per scope:** nothing implemented, no dependency installed, no schema change, no
`supabase/migrations/` edit, no B6/B7 rework, no Swagger, no CI, no B10.

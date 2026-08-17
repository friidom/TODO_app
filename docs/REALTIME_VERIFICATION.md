# Realtime verification — M6-B

M6-12's deliverable: the milestone's security and concurrency checks, each with
its **actual** status. Nothing below is marked passed because it looks likely.

Three columns of evidence, kept apart on purpose:

| Mark | Means |
|---|---|
| **AUTO** | A Vitest assertion. Runs on every `npm test`. |
| **LIVE** | Queried against the linked project (`nxnnfaoyttbzndphnawe`) on 2026-08-18. |
| **MANUAL** | Needs a second account and/or a second browser. **Not run.** |

The environment this was built in has one account and no second browser, so
every behavioural check is MANUAL and stays that way until someone runs it.
That is a gap in the evidence, not a gap in the implementation, and it is
recorded here rather than glossed.

---

## M6-07 · Publication and permissions

### Verified live

```sql
select pubname, puballtables from pg_publication;
-- supabase_realtime | false

select schemaname, tablename from pg_publication_tables
 where pubname = 'supabase_realtime' order by tablename;
-- public | columns
-- public | todos

select relname, relreplident, relrowsecurity from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and relname in ('todos','columns');
-- columns | d | true
-- todos   | d | true

select tablename, policyname, cmd, qual from pg_policies
 where schemaname = 'public' and tablename in ('todos','columns') and cmd = 'SELECT';
-- columns | Members select columns | SELECT | (board_id IN (SELECT accessible_board_ids()))
-- todos   | Members select todos   | SELECT | (board_id IN (SELECT accessible_board_ids()))
```

- **LIVE** — The publication existed and held **zero tables** before this
  milestone. It is a named-table publication (`puballtables = false`), so
  nothing was ever being replicated by accident.
- **LIVE** — After M6-07 it holds exactly `public.todos` and `public.columns`.
  `boards`, `board_members`, `spaces`, `profiles` and `activities` are not on it.
- **LIVE** — Both tables keep `REPLICA IDENTITY DEFAULT` (`d`). See the
  migration for why widening it to `full` was refused.
- **LIVE** — RLS is enabled on both, and the SELECT policy on each is the
  single `accessible_board_ids()` swap point M2 established. Realtime authorizes
  INSERT and UPDATE payloads through exactly this policy.

### The four security requirements

| # | Requirement | Status |
|---|---|---|
| 1 | A non-member receives no events for a board | **MANUAL** |
| 2 | A viewer receives events but the client does not assume write permission | **AUTO (partial)** + **MANUAL** |
| 3 | A member removed while subscribed stops receiving events | **MANUAL** |
| 4 | No payload exposes a column the client could not have selected | **ARGUED** + **MANUAL** |

**1 — non-member.** The policy above is the mechanism, and it is the same one a
`select` goes through. It has not been observed over a socket. To run: sign in
as an account with no membership on board X, subscribe to `board:X`, have the
owner create/rename/move a card, confirm nothing arrives.

**2 — viewer.** Partly automatic: no handler in `events.ts` writes to the
database or consults permissions, and the cache functions it calls are pure, so
receiving an event cannot cause a write. What is **not** verified is that a
viewer's session receives the events at all (it should — a viewer can select the
rows) and that no UI affordance appears as a result. To run: viewer account
open on a board while an editor edits it.

**3 — removal while subscribed.** This is the one the plan expects to produce a
*finding* rather than a pass. Realtime authorizes the connection from the JWT
presented at subscribe time; if a membership row is deleted mid-session, the
policy result changes at the database but the open channel is not re-evaluated
until the socket reconnects or the token refreshes. **The window has not been
measured.** To run: subscribe as a member, remove that member from the board,
then edit a card and time how long events continue to arrive. Record the answer
here — including "it stopped immediately" if that is what happens. If the window
is real, the fix is to force a resubscribe on membership change, and that is a
new task in `IMPLEMENTATION_PLAN.md` before this milestone closes.

**4 — payload columns.** Argued, and the argument is sound but not observed:
RLS here is *row*-level, `accessible_board_ids()` decides whole rows, and
`fetchTodo` already returns `select("*")` to any member — so every column of a
row a client receives is a column that client could have selected. There is no
column the board query hides for security; `TODO_FIELDS` is narrowed for
payload size (M5-07), not for access. To run: inspect a payload in the network
tab and confirm it contains only `todos` columns of a board you are a member of.

**The DELETE asymmetry, recorded as a known property rather than a finding.**
Under `REPLICA IDENTITY DEFAULT` a delete payload carries the primary key and
nothing else, so a server-side filter on `board_id` can never match one — which
is why `useBoardRealtime` subscribes to DELETE *without* the board filter and
reconciles by id against the cached array. The consequence: a client may receive
the uuid of a row deleted on a board it cannot read. A uuid identifies a row
without describing it, and the alternative (`replica identity full`) would put
the whole deleted row on that same wire. **MANUAL:** confirm a delete payload
contains only `{ id }`.

---

## M6-08 · Channel lifecycle

| Check | Status |
|---|---|
| One channel per board, subscribed in `BoardPage` | **AUTO (by construction)** — a single `useBoardRealtime` call site; `grep` proves there is no second one |
| Old channel closes and a new one opens on board change | **MANUAL** |
| Ten navigations leave no accumulated channels | **MANUAL** — run `supabase.getChannels().length` in the console after ten board switches; expect 1 |
| The connection survives tab backgrounding and reconnects | **MANUAL** |

The teardown is `supabase.removeChannel(channel)` in the effect's cleanup, keyed
on `[boardId, userId, queryClient]` — it unsubscribes, clears presence and drops
the channel from the client registry. `unsubscribe()` alone would leave the
registry entry, which is the leak this avoids.

---

## M6-09 · Cache handlers

| Check | Status |
|---|---|
| Insert / update / delete call the same `apply*` functions the mutations use | **AUTO** — `events.test.ts` |
| A remote move lands in the right column at the sender's rank | **AUTO** |
| An update for an unknown row is dropped, not invented | **AUTO** |
| A delete for another board's id is a no-op | **AUTO** |
| No handler mutates the cached array | **AUTO** |
| **Never refetches the board on an event** | **AUTO (by construction)** — no handler calls `invalidateQueries`; the only invalidation is on *re*-subscribe |
| Two browsers: A creates / renames / deletes / moves, B reflects each within a second | **MANUAL** |
| No full refetch visible in the network tab | **MANUAL** |

---

## M6-10 · Echo suppression

| Check | Status |
|---|---|
| An INSERT whose id is already cached is ignored | **AUTO** |
| The optimistic row keeps its slot rather than being replaced | **AUTO** |
| A redelivered remote insert is idempotent | **AUTO** |
| Create a card → it appears exactly once, never briefly twice | **MANUAL** |
| Drag a card → no flicker back to the old position | **MANUAL** |
| Two rapid creates → two cards, correct order | **MANUAL** |

The mechanism is the client-minted uuid (M2-14) and nothing else — no origin
header, no pending-write list, no second identity. That is what the plan
specified: *"with client-generated UUIDs this is an identity match."*

---

## M6-11 · Presence

| Check | Status |
|---|---|
| Presence is not persisted anywhere | **AUTO (by construction)** — no table, no query key, no write, no roster fallback |
| **Everyone connected is listed, the viewer included** | **AUTO** |
| One person with two tabs counts once | **AUTO** |
| The same person under two keys counts once | **AUTO** |
| Someone leaving disappears from the list | **AUTO** |
| Order is stable across reconnects | **AUTO** |
| Two browsers see each other | **MANUAL — re-test needed after the 2026-08-18 fix** |
| Closing one removes the avatar within a few seconds | **MANUAL** |
| A network drop eventually clears it | **MANUAL** |

> **Failure found and fixed, 2026-08-18.** Two-account testing showed each
> client rendering one avatar and never more — the roster looked stuck at one
> person no matter how many joined. **The transport was never at fault.**
> `viewersFrom` filtered the current user out of its own list by design, so with
> A and B connected, A's list was `[B]` and B's was `[A]`: one avatar each, two
> correct clients, and no way for either person to tell the difference between
> "presence is broken" and "presence excludes me". Self is now included, and the
> unit tests pin it.
>
> Two robustness changes went in alongside it. `config.presence.enabled` is now
> set explicitly rather than left to realtime-js inferring it from the existence
> of a `presence` binding at `subscribe()` time — without that flag the client
> never requests the initial snapshot and `presenceState()` stays empty
> permanently, which is a silent failure that depends only on the order two
> chained calls are written in. And `PresenceStack` now draws a viewer the
> roster has not caught up with as an anonymous disc instead of dropping them,
> so the count cannot under-report someone who is genuinely connected.

---

## M6-12 · Concurrency

Every row here is **MANUAL**. None has been run.

| Scenario | Expected |
|---|---|
| Local mutation and a remote one arriving together | Both survive; neither is lost to the other's snapshot |
| Insert / update / delete ordering | Out-of-order delivery converges; an update before its insert is dropped and recovered by the reconnect resync |
| Moving a task between columns on two clients | One winner, no duplicate, no orphan |
| Two clients dragging different cards in one column | Both survive — this is what M6-A's single-row rank writes buy |
| Two clients editing the same task | Last write wins on the field level, whole-row replacement, no merge invented |
| Column create / rename / delete | Reflected on the other client without a refetch |
| Echo events | Covered by M6-10's manual rows |
| Navigation between boards | Old channel gone, new one live |
| Ten navigations | One channel, not ten |
| A client offline for 30 seconds | Converges on reconnect via the one-shot resync in `useBoardRealtime` |

**A failure in any of these becomes a task in `IMPLEMENTATION_PLAN.md` before
M6-B closes** — that is M6-12's own instruction and it has not been overtaken.

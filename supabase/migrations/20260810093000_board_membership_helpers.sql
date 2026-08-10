-- M3-02 · Board membership helper functions. MEDIUM RISK.
--
-- The two questions every M3 policy needs answered:
--
--   is_board_member(board) → may this user touch this board at all?
--   board_role(board)      → as what?
--
-- Additive on its own: nothing calls these yet, and M3-01's board_members is
-- still empty, so today they return false and null for everybody. They exist
-- now because they are the recursion remedy, and a remedy added after the
-- outage is not a remedy. From M3-04 onward, every policy that needs to know
-- about membership calls one of these instead of sub-selecting board_members.
--
-- MEDIUM RISK rather than SAFE: nothing breaks when this is applied, but
-- everything M3-04 and M3-05 do rests on these three properties being right —
-- SECURITY DEFINER, STABLE, and a pinned search_path. Each is load-bearing for
-- a different reason, spelled out below.


-- 1. is_board_member ----------------------------------------------------------

create or replace function public.is_board_member(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members m
    where m.board_id = p_board_id
      and m.user_id = (select auth.uid())
  );
$$;

comment on function public.is_board_member(uuid) is
  'Whether the current user holds any role on the board. SECURITY DEFINER so '
  'the read of board_members bypasses RLS — a policy on board_members that '
  'sub-selected board_members would recurse.';


-- 2. board_role ---------------------------------------------------------------
--
-- Returns NULL for a non-member, which is the useful answer rather than a
-- missing one: a policy written as `public.board_role(board_id) in ('owner',
-- 'admin')` yields NULL for a stranger, and both USING and WITH CHECK treat a
-- NULL result as a failure. So the non-member case is denied by the same
-- expression that grants the member case, with no separate null branch to
-- forget. `is not distinct from` would break that and is deliberately not used.
--
-- The primary key (board_id, user_id) from M3-01 guarantees at most one row,
-- so this cannot return more than one value and needs no LIMIT.

create or replace function public.board_role(p_board_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.board_members m
  where m.board_id = p_board_id
    and m.user_id = (select auth.uid());
$$;

comment on function public.board_role(uuid) is
  'The current user''s role on the board, or NULL if they are not a member. '
  'NULL propagates to false through the role comparisons in M3-04/M3-05 '
  'policies, so non-membership is denied by the same expression.';


-- 3. Why SECURITY DEFINER — the recursion remedy -------------------------------
--
-- M3-04 and M3-05 will need a policy ON board_members of the shape "you may
-- read a membership row if you are a member of that board" — that is what
-- M3-07's member list requires, since M3-01's policy only exposes your own row.
-- Written naively:
--
--   create policy ... on board_members using (
--     board_id in (select board_id from board_members where user_id = auth.uid())
--   );
--
-- Reading board_members evaluates that policy, which reads board_members,
-- which evaluates that policy. Postgres detects the cycle and aborts the
-- statement with `infinite recursion detected in policy for relation
-- "board_members"` — every request touching the table becomes a 500. There is
-- no partial failure and no slow degradation; it is immediate and total.
--
-- SECURITY DEFINER breaks the cycle at the first hop. The function executes
-- with the privileges of its owner rather than its caller, and the owner here
-- is `postgres`, which owns board_members. Postgres does not apply row-level
-- security to a table's owner, so the `select ... from public.board_members`
-- inside these bodies is not policy-filtered — it reads the base table
-- directly. Nothing re-enters policy evaluation, so there is nothing to
-- recurse into. The termination argument is that short: the only table these
-- functions read is board_members, and that read is exempt.
--
-- The one way to break it: `alter table public.board_members force row level
-- security` would apply policies to the owner too and reintroduce the cycle.
-- Do not.
--
-- This is the same reasoning M2-08 recorded for accessible_board_ids(), which
-- is SECURITY DEFINER so that policies on columns/todos can read boards
-- without nesting policy evaluation inside policy evaluation. That was the
-- pattern being established for this migration to inherit.


-- 4. Why STABLE ---------------------------------------------------------------
--
-- Three things it is not: not IMMUTABLE, because the body reads a table whose
-- contents change and depends on auth.uid(); not VOLATILE, because it modifies
-- nothing; and not a free annotation, because the volatility class is what the
-- planner is allowed to reason from.
--
-- STABLE promises the result is constant for the same arguments within a
-- single statement, under one snapshot. What that buys, concretely, on a board
-- load:
--
-- Every board query the client issues is scoped — `todos?board_id=eq.X`,
-- `columns?board_id=eq.X`. A policy of the form `is_board_member(board_id)`
-- reads as per-row, but the WHERE clause pins board_id to a constant, and
-- equivalence-class propagation lets the planner substitute it into the policy
-- expression. The call is then row-independent, and a STABLE row-independent
-- expression is evaluated ONCE for the statement as a one-time filter, not
-- once per todo. On a 500-card board that is the difference between one index
-- probe and five hundred.
--
-- VOLATILE would forbid that substitution outright and force re-execution per
-- row, and would also bar these functions from index conditions.
--
-- What STABLE does NOT do is memoize across differing arguments — Postgres
-- does not cache STABLE results by argument. An unscoped query (a board list
-- calling board_role() per board) really is one call per row. M3-12 is where
-- that gets measured rather than assumed; if a plan shows a per-row Filter
-- where a One-Time Filter was expected, that is the finding.
--
-- Note also that neither function will be inlined, for two independent
-- reasons: the planner refuses to inline a SQL function that is SECURITY
-- DEFINER, and refuses again for one carrying a proconfig setting (the
-- search_path below). So each is a real call. That is the price of the
-- recursion remedy and it is the right trade — but it is why STABLE, and the
-- constant-folding it permits, is doing real work rather than decorating.


-- 5. Why SET search_path = '' --------------------------------------------------
--
-- Mandatory for any SECURITY DEFINER function, and the reason is escalation,
-- not tidiness. The body runs with the owner's privileges. If unqualified
-- names resolved through the CALLER's search_path, a caller who can create a
-- schema could define their own `board_members` table in it, put that schema
-- first, and have this owner-privileged function read their table instead of
-- the real one — is_board_member() would then return whatever they wanted, and
-- every policy built on it would agree. The same trick works on operators and
-- functions, so even `=` is not safe to leave to the caller's path.
--
-- Pinning it to the empty string resolves nothing implicitly, which is why
-- every reference in both bodies is schema-qualified: public.board_members,
-- and auth.uid() rather than uid(). A missed qualification fails loudly at
-- call time instead of silently resolving somewhere unintended.
--
-- Supabase's linter flags this as `function_search_path_mutable`; the codebase
-- already sets it on accessible_board_ids() and assign_todo_board_key().


-- 6. Grants --------------------------------------------------------------------
--
-- EXECUTE is granted to PUBLIC by default, so the revoke is the part that does
-- the work. anon calling these would get auth.uid() = NULL and therefore false
-- and NULL, which is harmless — but a SECURITY DEFINER function should not be
-- reachable by a role with no business calling it. Same shape as M2-08.

revoke all on function public.is_board_member(uuid) from public, anon;
grant execute on function public.is_board_member(uuid) to authenticated;
grant execute on function public.is_board_member(uuid) to service_role;

revoke all on function public.board_role(uuid) from public, anon;
grant execute on function public.board_role(uuid) to authenticated;
grant execute on function public.board_role(uuid) to service_role;


-- 7. What is deliberately NOT changed ------------------------------------------
--
-- No policy is rewritten here. board_members keeps M3-01's self-read policy,
-- boards/columns/todos keep their M2-08 owner policies, and
-- accessible_board_ids() still reads boards.owner_id. Widening those is M3-04
-- and M3-05, and doing it here would make a MEDIUM RISK migration a HIGH RISK
-- one before the M3-03 backfill has put a single row in board_members — which
-- is the exact ordering that locks every existing owner out of their board.
--
-- One note for whoever writes M3-04/M3-05, since it follows from section 4:
-- these two helpers are the ROLE-GRANULAR tools, for the verbs where the
-- answer depends on which role. The row-independent question "which boards may
-- I see at all" is still better served by widening accessible_board_ids() to
-- read board_members, because a set-returning no-argument function is planned
-- as an InitPlan evaluated once per statement regardless of how the query is
-- scoped. Reaching for is_board_member() everywhere would work and would be
-- slower.


-- Rollback ----------------------------------------------------------------------
--
--   drop function if exists public.is_board_member(uuid);
--   drop function if exists public.board_role(uuid);
--
-- Clean while this is the last M3 migration applied: nothing calls either
-- function. It stops being clean at M3-04, whose policies depend on them —
-- from that point the drop must be preceded by restoring the M2-08 policies.


-- Verification --------------------------------------------------------------------
--
-- The task's tests. Note that until M3-03 backfills, board_members is empty
-- and the honest expected result for every user is `false` / `null` — that is
-- a pass, not a failure, and it is what makes the M3-03 verification below
-- meaningful.
--
--   -- properties are what this migration is for; assert them rather than trust
--   select proname,
--          prosecdef                              as security_definer,
--          provolatile                            as volatility,   -- expect 's'
--          proconfig                              as settings      -- expect {search_path=}
--   from pg_proc
--   where proname in ('is_board_member', 'board_role');
--
--   -- as two different users, via PostgREST RPC with each one's real token:
--   curl -X POST "$URL/rest/v1/rpc/is_board_member" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
--     -H "Content-Type: application/json" -d '{"p_board_id":"<board>"}'
--   curl -X POST "$URL/rest/v1/rpc/board_role" ... same shape
--   -- today: false / null for both users, and no 500 from either.
--   -- after M3-03: true / "owner" for the board's owner, false / null for the
--   -- other user. A 500 mentioning "infinite recursion detected in policy"
--   -- would mean SECURITY DEFINER was lost — check `prosecdef` above.
--
--   -- the planner claim from section 4, on a scoped board fetch:
--   explain analyze
--   select * from public.todos where board_id = '<board>';
--   -- with the policy in place (M3-05), expect the membership check to appear
--   -- as a One-Time Filter rather than a per-row Filter. Capture this for the
--   -- M3-12 comparison against the M2-05 baseline.

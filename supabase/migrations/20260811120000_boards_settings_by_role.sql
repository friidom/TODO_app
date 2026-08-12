-- M3-17 · Board settings by role. MEDIUM RISK. Tier A.
--
-- M3-04 widened only the SELECT policy on boards. UPDATE and DELETE are still
-- M2-01's owner-only predicates, which no longer match the Permission Model:
--
--   admin  →  may rename / re-theme the board   (board administration)
--   owner  →  that, plus delete                 (irreversible, cascades)
--
-- Replaces exactly one policy. Touches no row.


-- 1. Captured pre-change state -------------------------------------------------
--
-- Verbatim from 20260806090000_create_boards.sql (M2-01). This capture is the
-- rollback path — there is no PITR, and Rule 6 makes the capture the recovery.
--
--   drop policy if exists "Users update own boards" on public.boards;
--   create policy "Users update own boards" on public.boards
--     for update to authenticated
--     using (owner_id = (select auth.uid()))
--     with check (owner_id = (select auth.uid()));
--
-- Unchanged by this migration, and repeated here so the whole `boards` policy
-- set is legible from one file:
--
--   create policy "Users insert own boards" on public.boards
--     for insert to authenticated
--     with check (owner_id = (select auth.uid()));
--
--   create policy "Users delete own boards" on public.boards
--     for delete to authenticated
--     using (owner_id = (select auth.uid()));
--
--   -- M3-04 replaced M2-01's SELECT policy with this one:
--   create policy "Members select accessible boards" on public.boards
--     for select to authenticated
--     using (owner_id = (select auth.uid()) or public.is_board_member(id));


-- 2. UPDATE: admin and owner ----------------------------------------------------
--
-- `board_role(id)` rather than `owner_id = auth.uid() or board_role(id) =
-- 'admin'`. The owner arm is not needed: M3-03's backfill and its
-- add_owner_membership trigger give every board an owner membership row, and
-- M3-15 makes that row un-deletable and un-re-roleable. So board_role() returns
-- 'owner' for the owner on every board that exists, and the shorter predicate
-- is the same predicate. This matches how M3-05 writes its content policies.
--
-- Non-membership yields NULL, and `NULL in (...)` is NULL, which both USING and
-- WITH CHECK treat as false. That is the M3-02 design — no separate null branch.
--
-- USING and WITH CHECK are the same expression on purpose. USING decides which
-- rows may be targeted; WITH CHECK decides what the row may become. Identical
-- here because neither the board's identity nor the caller's role may change
-- through this path.

drop policy if exists "Users update own boards" on public.boards;
drop policy if exists "Admins and above update boards" on public.boards;
create policy "Admins and above update boards" on public.boards
  for update to authenticated
  using (public.board_role(id) in ('owner', 'admin'))
  with check (public.board_role(id) in ('owner', 'admin'));


-- 3. owner_id is still not writable through this path ---------------------------
--
-- The task flagged this: "a WITH CHECK that permits changing owner_id would be
-- an ownership transfer with no ceremony." It is a real concern and the policy
-- above does not answer it — an RLS policy CANNOT.
--
-- USING is evaluated against the old row and WITH CHECK against the new one.
-- Neither can see the other, so no policy expression can say "owner_id is
-- unchanged". Writing `with check (owner_id = (select auth.uid()))` would not
-- express it either; it would just lock admins out entirely.
--
-- The enforcement is M3-15's `boards_owner_immutable` BEFORE UPDATE trigger,
-- which raises 42501 whenever `new.owner_id is distinct from old.owner_id`, for
-- every writer including service_role. That trigger landed after this task was
-- written, which is why the task words the requirement as a policy problem.
--
-- The rejected alternative is column-level privileges: revoke table-level
-- UPDATE from authenticated and grant it per column, omitting owner_id. It is
-- weaker (a grant, not an invariant — service_role holds `grant all`) and it is
-- a maintenance trap: every column added later is silently un-updatable until
-- someone remembers to grant it. Not done.


-- 4. DELETE: unchanged, owner-only ----------------------------------------------
--
-- M2-01's `using (owner_id = (select auth.uid()))` stays exactly as it is.
--
-- It is deliberately NOT rewritten to `board_role(id) = 'owner'` for symmetry
-- with section 2. The two are equivalent under I5, but this is the one verb
-- that cascades across every table in the schema, and it is worth having it
-- gated by the boards row itself rather than by a second table that a future
-- migration could widen. Smallest diff, strongest remaining check.


-- 5. What is deliberately NOT changed --------------------------------------------
--
-- INSERT — creating a board makes you its owner by definition; the membership
-- row does not exist yet at WITH CHECK time (the trigger is AFTER INSERT), so a
-- board_role() predicate here would deny every board creation and break signup.
--
-- The `next_key` UPDATE that assign_todo_board_key() performs on every work-item
-- insert is unaffected: that trigger is SECURITY DEFINER and bypasses RLS
-- entirely. The Editor create path depends on it, and this migration does not
-- touch it.
--
-- Grants — `select, insert, update, delete` to authenticated from M2-01 stand.
-- Privileges say which verbs exist; policies say which rows. This is a policy
-- change.


-- Rollback ------------------------------------------------------------------------
--
-- Forward-fix in a NEW migration, restoring section 1 verbatim:
--
--   drop policy if exists "Admins and above update boards" on public.boards;
--   create policy "Users update own boards" on public.boards
--     for update to authenticated
--     using (owner_id = (select auth.uid()))
--     with check (owner_id = (select auth.uid()));
--
-- Narrows board updates back to the owner. Nothing depends on the wider rule
-- until M3-08 ships a rename control for admins.


-- Verification ----------------------------------------------------------------------
--
-- scripts/verify-m3-16-role-matrix.sql §5 and §6 cover all of this — these are
-- cells of the matrix M3-16 gates the milestone on, not a separate concern, so
-- they live in that harness rather than in one of their own. In summary:
--
--   admin renames a board                    → succeeds
--   admin deletes a board                    → 0 rows (policy filters it out)
--   editor renames                           → 0 rows
--   viewer renames                           → 0 rows
--   non-member renames                       → 0 rows
--   admin sets owner_id to themselves        → raises 42501 (M3-15's trigger)
--   owner renames                            → succeeds
--   owner deletes                            → succeeds, cascades
--
-- Note that a denied UPDATE under RLS is 0 rows affected, not an error. PostgREST
-- reports that as 204/empty rather than 42501 — an absence, which is why the
-- harness asserts the row is unchanged rather than trusting a status code.

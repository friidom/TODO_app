-- M7-01 · Create `comments`. MEDIUM RISK. Tier A.
--
-- The last MVP item's table. Nothing reads or writes it yet — M7-02 builds the
-- hooks, M7-03 the UI — so this migration's whole job is to be the shape those
-- two do not get to re-decide.
--
--
-- THE PERMISSION DECISION, WHICH M7-01 WAS BLOCKED ON
--
-- IMPLEMENTATION_PLAN.md carried "May a viewer comment?" as an open decision
-- with an explicit instruction: it *must* be resolved before this file's RLS is
-- written, and the answer recorded in the Permission Model table in Part II
-- rather than left in a migration's prose. Resolved as the plan recommended,
-- and Part II's matrices are updated in the same change:
--
--   · Any member may comment, viewer included. Commenting is participation,
--     not content. A reviewer who can read a board but not change it is
--     exactly the person with something to say about it, and the capability is
--     cheap to grant now and expensive to withdraw once people use it.
--   · An author may edit only their own comment. Nobody edits someone else's
--     text — not an admin, not the owner.
--   · An author may delete their own; admins and owners may delete any. That
--     second half is moderation, and it is the only power over a comment that
--     anyone but its author has.
--
-- Section 6 is that paragraph as four policies, and it is the authority. This
-- comment is the reasoning, not the rule.
--
--
-- BLAST RADIUS
--
-- Additive except for one alteration to `todos`: section 3 adds a unique
-- constraint on `(id, board_id)` so the composite foreign key has something to
-- reference. It adds no uniqueness — `id` is already the primary key — which is
-- exactly what makes it safe. It does build an index and take a brief lock on
-- `todos`; M3-18 did the identical thing to `columns` and it was uneventful.
--
-- No existing policy is replaced, no existing row is read or written, and no
-- function is redefined. `accessible_board_ids()`, `board_role()` and
-- `set_updated_at()` are all CALLED and none is changed.
--
-- BACKUP — NOT TAKEN, and not required. Tier A under Rule 6: this creates
-- objects and writes no row. Rollback is section 8's forward-fix SQL. PITR is
-- still not enabled on this project and nothing here needs it.


-- 1. The referenced key -------------------------------------------------------
--
-- A foreign key must reference a unique constraint, so `todos` needs one on
-- (id, board_id) before section 2 can point at it. This is M3-18's section 1
-- verbatim, applied to the other table: no new uniqueness, one redundant index,
-- and the standard idiom for the problem — cheaper than a trigger that would
-- have to fire on both tables and be maintained by hand.

alter table public.todos
  drop constraint if exists todos_id_board_id_key;

alter table public.todos
  add constraint todos_id_board_id_key unique (id, board_id);


-- 2. The table ----------------------------------------------------------------
--
-- `board_id` is the policy key, as it is on every board-scoped child table in
-- this schema. M7-01's own addendum is the reason: the membership helpers take
-- a board id, and without a denormalised one every policy evaluation would join
-- comments → todos to find it, on every row. docs/DATABASE.md warns against
-- duplicated information and this is the exception it names — a derived key
-- used by the security boundary, not duplicated user data — and it keeps every
-- collaborative table on the same one-hop predicate.
--
-- **`author_id` is `on delete cascade`, and it is the one place this schema
-- departs from `todos.creator_id` / `activities.actor_id`, both `set null`.**
-- Those two are attribution *on somebody else's row* and the row outlives the
-- person. A comment is not annotated by its author, it *is* its author's words:
-- an authorless comment is not a record of anything, and deleting an account
-- should take what that person said with it. Hence `not null` as well — there
-- is no meaningful comment with no author, so the column does not admit one.
--
-- **No foreign key to `boards`, deliberately.** The composite key in this same
-- definition already pins `board_id` to the referenced work item's board, and
-- `todos.board_id` references `boards` under cascade — so deleting a board
-- cascades to its work items and from there to their comments, and `board_id`
-- cannot name a board that does not exist. A direct FK would restate a
-- constraint that already holds and add a second edge for PostgREST to reason
-- about. `activities` carries one only because it has no work item to hang off.
--
-- **Blank content is refused by the database, not by the composer.** M7-03's
-- test list requires empty and whitespace-only submissions to be rejected;
-- Enforcement rule 6 says an invariant that must hold for every writer belongs
-- in a constraint rather than in one caller. `btrim` covers the whitespace-only
-- case that a `<> ''` check would let through. There is deliberately no maximum
-- length: no other text column in this schema has one, and inventing a limit
-- here would be a product decision made by a migration.

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null,
  todo_id    uuid not null,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- M3-18's pattern, and the reason it is one constraint rather than a trigger
  -- plus a check: a comment on a work item must agree with that work item about
  -- which board it is on. Without it, `board_id` is a claim the client makes
  -- and the read policy believes — a comment could be filed under a board the
  -- author can reach while pointing at a card on a board they cannot, which is
  -- the cross-board write M3-18 closed for work items.
  --
  -- ON DELETE CASCADE, not RESTRICT: M3-18 kept RESTRICT because deleting a
  -- column must not delete its cards — they are rehomed first. A comment has
  -- nowhere to be rehomed to. A thread on a deleted card is not history, it is
  -- an orphan, and `activities` already records that the card was deleted.
  constraint comments_todo_id_fkey
    foreign key (todo_id, board_id) references public.todos (id, board_id)
    on delete cascade,

  constraint comments_content_not_blank check (length(btrim(content)) > 0)
);

comment on table public.comments is
  'Task discussion. Any board member may post, an author may edit only their '
  'own, and an author or an admin/owner may delete. board_id is the policy key '
  'and is pinned to the work item''s board by comments_todo_id_fkey.';

comment on column public.comments.author_id is
  'Who wrote it. NOT NULL and ON DELETE CASCADE — unlike todos.creator_id, a '
  'comment is its author''s words rather than attribution on someone else''s '
  'row, so deleting the account takes them with it.';

comment on column public.comments.board_id is
  'Denormalised from the work item so every policy is one hop. Cannot drift '
  'from todos.board_id — the composite foreign key refuses it.';


-- 3. Index --------------------------------------------------------------------
--
-- docs/DATABASE.md specifies `comments(todo_id)`; this is that index with a
-- second column, which satisfies it — a leading-column match is what the
-- planner needs for `todo_id = $1` and for the referencing side of the FK when
-- a work item is deleted.
--
-- The second column is free and removes the sort. The only query M7-02 will
-- issue is one thread in posting order (`todo_id=eq.X&order=created_at`), so
-- (todo_id, created_at) answers it as a range scan with no sort node, exactly
-- as `activities_board_created_idx` does for the feed.
--
-- No index on `board_id`. Nothing queries comments board-wide — moderation
-- happens inside a thread — and an index for a query nobody makes is a write
-- cost with no reader.

create index if not exists comments_todo_created_idx
  on public.comments (todo_id, created_at);


-- 4. updated_at ---------------------------------------------------------------
--
-- The shared M2-04 trigger, wired the way the other three tables wire it. It is
-- what lets M7-03 show an "edited" marker without the client having to be
-- trusted to stamp it, and what M6's conflict resolution reads.

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();


-- 5. RLS ----------------------------------------------------------------------

alter table public.comments enable row level security;


-- Read: any member, through the same predicate every board-scoped table uses.
-- Not `board_role(board_id) is not null` — `accessible_board_ids()` is the
-- single swap point M2-08 built and M3-05 widened, and a set-returning
-- no-argument function is planned as an InitPlan evaluated once per statement
-- rather than once per row. A comment is visible under exactly the same rule as
-- the card it hangs off, with no second rule to keep in step.
drop policy if exists "Members select comments" on public.comments;
create policy "Members select comments" on public.comments
  for select to authenticated
  using (board_id in (select public.accessible_board_ids()));


-- Write: the four roles spelled out rather than `is_board_member(board_id)`,
-- which would be equivalent today. The list is the decision — it says
-- "including viewer" in the place someone will look when they doubt it — and it
-- fails closed if a fifth role is ever added, where the membership test would
-- silently admit it. `board_role` returns NULL for a non-member and NULL fails
-- WITH CHECK, so non-membership is denied by the same expression.
--
-- `author_id = auth.uid()` is what stops a member posting as somebody else.
-- PostgREST would happily send any uuid in that column.
drop policy if exists "Members insert own comments" on public.comments;
create policy "Members insert own comments" on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.board_role(board_id) in ('owner', 'admin', 'editor', 'viewer')
  );


-- Edit: the author, and only the author. An admin editing someone else's text
-- would make the attribution a lie, which is a different and worse thing than
-- deleting it.
--
-- USING decides which rows may be updated, WITH CHECK what they may become —
-- both clauses, because a policy with only USING would let an author hand their
-- comment to another member by rewriting `author_id`. The column grant in
-- section 6 makes that unreachable anyway; the clause is here so the rule is
-- readable in the policy rather than only in a GRANT.
drop policy if exists "Authors update own comments" on public.comments;
create policy "Authors update own comments" on public.comments
  for update to authenticated
  using (
    author_id = (select auth.uid())
    and public.board_role(board_id) in ('owner', 'admin', 'editor', 'viewer')
  )
  with check (
    author_id = (select auth.uid())
    and public.board_role(board_id) in ('owner', 'admin', 'editor', 'viewer')
  );


-- Delete: your own, or anyone's if you administer the board. The two halves are
-- different powers and the OR is the whole of the difference — an editor
-- reaches only their own row, an admin reaches every row on the board.
--
-- Note what this does NOT grant: an admin on board A has no path to a comment
-- on board B, because both halves resolve `board_role` on the row's own
-- board_id, and that column cannot lie (section 2).
drop policy if exists "Authors and moderators delete comments" on public.comments;
create policy "Authors and moderators delete comments" on public.comments
  for delete to authenticated
  using (
    public.board_role(board_id) in ('owner', 'admin')
    or (
      author_id = (select auth.uid())
      and public.board_role(board_id) in ('owner', 'admin', 'editor', 'viewer')
    )
  );


-- 6. Grants -------------------------------------------------------------------
--
-- The revoke is not redundant: the linked project carries
-- `alter default privileges ... grant all on tables to anon`, so a table
-- created here starts out granted to anon. Revoke first, then grant back
-- exactly what is wanted. M3-13, M4-01 and M18 all record this.
--
-- **UPDATE is granted on `content` alone, and that column list is doing real
-- security work.** A row-level policy can say who may update a row; it cannot
-- say which columns they may touch. Without the narrowing, an author editing
-- their own comment could also rewrite `created_at` to backdate it, or move it
-- to another card they can reach, in the same PATCH — all permitted by a policy
-- that only asks "is this your row, on a board you belong to". A column-level
-- grant is one line and closes the whole class, which is cheaper than a trigger
-- comparing five fields.
--
-- `updated_at` is not in the list and does not need to be: privilege checks
-- apply to the columns a statement names, and the BEFORE trigger in section 4
-- sets it afterwards.
--
-- What this means for M7-02: the edit mutation may send `content` and nothing
-- else. A PATCH carrying the whole row will be refused with 42501, and that is
-- the constraint working rather than a bug.

revoke all on table public.comments from anon;
revoke all on table public.comments from authenticated;

grant select, insert, delete on table public.comments to authenticated;
grant update (content)       on table public.comments to authenticated;
grant all                    on table public.comments to service_role;


-- 7. What is deliberately NOT here --------------------------------------------
--
-- · **Realtime.** `comments` is not added to the `supabase_realtime`
--   publication. M7-04 owns that, and its subscription is per open work item
--   rather than per board — a different lifecycle from M6-B's channel, and one
--   that should be built with its teardown rather than retrofitted to a table
--   that was already replicating.
--
-- · **A moderation read path.** Nothing lists a board's comments outside a
--   thread, so there is no index and no policy shaped for it.
--
-- · **Edit history.** An edited comment overwrites its own text. `activities`
--   is not extended to comments here: M18's event list is a checked
--   (entity_type, action) pair and widening it is that milestone's decision,
--   not this one's.
--
-- · **A cap on length or on comments per work item.** Both are product limits
--   and neither has been specified. The plan's stated risk is comment *volume
--   on the board query*, and the answer to that is architectural and already
--   taken: comments are keyed per work item and are never joined into the board
--   fetch.


-- 8. Rollback -----------------------------------------------------------------
--
-- Forward-fix, per Rule 4 — migrations here have no `down`. Reversing means a
-- new migration containing:
--
--   drop table if exists public.comments;          -- takes its policies,
--                                                  -- indexes and trigger
--   alter table public.todos
--     drop constraint if exists todos_id_board_id_key;
--
-- Drop order matters: the unique constraint cannot go while the composite FK
-- depends on it, and dropping the table removes that FK. Dropping the table
-- destroys user content, so this is a destructive reversal even though the
-- migration that created it was not — which is the ordinary asymmetry of any
-- CREATE TABLE and is called out only so nobody reads "Tier A" as "safe to
-- undo".
--
--
-- VERIFICATION
--
-- scripts/verify-m3-16-role-matrix.sql §12 covers the matrix, transactionally
-- and against the live schema. In summary, per role:
--
--   viewer  insert own → allowed          insert as another user → 42501
--   viewer  update own → allowed          update someone else's  → 0 rows
--   viewer  delete own → allowed          delete someone else's  → 0 rows
--   editor  same as viewer (commenting is not gated on write permission)
--   admin   delete anyone's → allowed     edit anyone's          → 0 rows
--   owner   same as admin
--   any     update of a column other than content → 42501
--   any     insert with blank or whitespace-only content → 23514
--   any     insert with a board_id that is not the work item's → 23503
--   non-member  select / insert on that board → 0 rows / 42501

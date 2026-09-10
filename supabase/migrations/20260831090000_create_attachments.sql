-- M32 · Attachments: a table and a private bucket. MEDIUM RISK. Tier A.
--
-- The last committed milestone of the Jira depth wave. Files on a work item:
-- the row that says what a file is lives in `public.attachments`, the bytes
-- live in a new `task-attachments` bucket, and the two are paired by
-- `storage_path`, which is unique.
--
--
-- THE TEMPLATE, AND THE ONE PLACE IT IS ADAPTED RATHER THAN COPIED
--
-- The plan is explicit that this milestone must not invent a second storage
-- pattern: `20260814101000_avatar_storage_ownership.sql` is the shape — a
-- bucket with a size limit, and policies keyed on `(storage.foldername(name))[1]`.
-- That is followed. What is NOT copied is the *subject* of the first path
-- segment.
--
-- An avatar belongs to one person, so `<uid>/avatar.png` and a policy reading
-- `(storage.foldername(name))[1] = auth.uid()::text` say the same thing twice
-- and the object is writable and readable by exactly its owner.
--
-- An attachment belongs to a BOARD. Every member has to read it, and a
-- uid-scoped path would make a file readable only by whoever uploaded it —
-- which is not an attachment, it is a private upload that happens to sit near
-- a task. So the first segment is the board id:
--
--   <board_id>/<todo_id>/<attachment_id>.<ext>
--
-- and the policies below test board membership on that segment instead of
-- identity. Same mechanic, correct subject. Section 6 is where that lands.
--
--
-- THE OBJECT NAME CARRIES NO USER TEXT, AND THAT IS A SECURITY PROPERTY
--
-- `uploadAvatar` builds its key with `file.name.split(".").pop()`, unsanitised.
-- That is safe there because the rest of the key is a uuid the client did not
-- choose. It is NOT safe for an arbitrary filename: a `/` inside the name
-- shifts every segment, so `foldername(name)[1]` would stop naming the board
-- and start naming whatever the uploader put first. The display name is stored
-- in the `filename` COLUMN and never in the key; the object is named by the
-- attachment's own uuid. `src/services/attachments/fileMeta.ts` builds the key
-- and its test pins that property.
--
--
-- THE THREE DECISIONS M32 REQUIRED TO BE SETTLED BEFORE THE FIRST UPLOAD
--
-- 1. The bucket is PRIVATE, unlike `avatars`. A profile picture is not a
--    secret and `getPublicUrl` signs nothing; a file on a private board is one.
--    Reads go through `createSignedUrl`, so SELECT on `storage.objects` is the
--    policy that matters and it is board-scoped.
--
-- 2. Who may upload, and who may delete. UPLOAD IS EDITOR AND ABOVE — the
--    content matrix, the same gate as creating or editing the work item the
--    file hangs off. This is deliberately NOT the comment matrix: M7-01 let a
--    viewer comment because "commenting is participation, not content", and a
--    file stored on somebody else's board is content by the same test.
--    DELETE is the uploader, plus admins and owners — the moderation shape
--    M7-01 established, reused rather than re-decided. Both matrices in Part II
--    of IMPLEMENTATION_PLAN.md gain a row in the same change.
--
-- 3. Orphan cleanup. Deleting the row cascades; deleting the OBJECT does not,
--    and a storage object whose row is gone is invisible and permanent. The
--    sweep is decided here rather than after the first upload:
--
--    · The client removes the object BEFORE the row, on both paths. On upload,
--      a failed insert removes the object it just wrote. On delete, the object
--      goes first and the row second, so a failure between them leaves a
--      VISIBLE broken row that can be retried — not an invisible orphan. That
--      ordering is safe because the two DELETE policies (section 5 and section
--      6) express one rule, so a storage delete that succeeds predicts a row
--      delete that will.
--
--    · The one case the client cannot cover is CASCADE: deleting a work item or
--      a board drops rows and leaves objects. That is accepted, not solved, and
--      the sweep is this query, run as `service_role` (which bypasses RLS —
--      section 6's DELETE policy deliberately cannot reach a rowless object):
--
--        select o.name
--          from storage.objects o
--          left join public.attachments a on a.storage_path = o.name
--         where o.bucket_id = 'task-attachments'
--           and a.id is null;
--
--      A scheduled function to run it is NOT built. There are no users, the
--      bucket is empty, and PH-01 (PITR) is the trigger that reopens the whole
--      of Part V; this is a query in a header until then, which is a decision
--      recorded rather than a task forgotten.
--
--
-- BLAST RADIUS
--
-- Purely additive to `public`. One new table, one index, four policies, one set
-- of grants. NO existing table is altered — in particular `todos` is NOT
-- touched: `todos_id_board_id_key`, which section 2's composite foreign key
-- references, was already created by `20260818100000_create_comments.sql`
-- section 1. Re-running that migration's `drop constraint if exists` + `add`
-- idiom here would now FAIL, because `comments_todo_id_fkey` depends on the
-- constraint. It is referenced, not recreated.
--
-- `accessible_board_ids()` and `board_role()` are CALLED and neither is
-- redefined. No existing policy is replaced.
--
-- In `storage`: one bucket row is inserted (or its configuration updated), and
-- three new policies are added to `storage.objects`. The existing `avatars`
-- policies are untouched — every clause below leads with
-- `bucket_id = 'task-attachments'`, because policies on `storage.objects` are
-- global across every bucket and one missing bucket clause would widen the
-- avatar bucket too.
--
-- BACKUP — NOT TAKEN, and not required. Tier A under Rule 6: this creates
-- objects and writes no user data. The single row it writes is the bucket's own
-- two-column configuration, and `on conflict do update` makes re-application
-- idempotent. Rollback is section 8's forward-fix SQL. PITR is still not
-- enabled on this project and nothing here needs it.


-- 1. Preconditions --------------------------------------------------------------
--
-- Nothing to do, stated so the absence is visibly deliberate rather than
-- forgotten:
--
--   · `todos_id_board_id_key` — already present (M7-01 section 1).
--   · `accessible_board_ids()` — already present (M3-05).
--   · `board_role(uuid)` — already present (M3-04).
--   · `gen_random_uuid()` — pgcrypto, already in use by four tables.


-- 2. The table ------------------------------------------------------------------
--
-- `board_id` is the policy key, as it is on every board-scoped child table in
-- this schema. M7-01's reasoning transfers unchanged: the membership helpers
-- take a board id, and without a denormalised one every policy evaluation would
-- join attachments → todos to find it, on every row.
--
-- **No foreign key to `boards`, deliberately** — the same argument M7-01 makes.
-- The composite key below already pins `board_id` to the referenced work item's
-- board, and `todos.board_id` references `boards` under cascade, so deleting a
-- board cascades to its work items and from there to their attachments.
-- `board_id` cannot name a board that does not exist, and a direct FK would
-- restate a constraint that already holds.
--
-- **`uploader_id` is `on delete set null`, and this is the one place this table
-- departs from `comments.author_id`.** That column is `not null` and cascades
-- because a comment is not annotated by its author, it IS its author's words —
-- an authorless comment is not a record of anything. A file is the other kind
-- of thing: it is a contribution to a work item the board collectively owns,
-- and deleting an account must not delete a spec three other people are working
-- from. So this follows `todos.creator_id` and `activities.actor_id` instead —
-- attribution on a row that outlives the person, which is exactly what it is.
--
-- **No `updated_at`, and no `set_updated_at` trigger.** An attachment is
-- immutable: there is no edit, section 5 grants no UPDATE policy and section 7
-- grants no UPDATE privilege. Renaming a file is delete plus re-upload.
--
-- `storage_path` is UNIQUE, which is what makes the row and the object a pair
-- rather than two things that happen to agree. It is also what lets section 6's
-- DELETE policy find one row for one object name.
--
-- `mime_type` is `not null` with no CHECK. The bucket has no allow-list — the
-- product requirement is explicitly not to restrict file types — so this column
-- records what was uploaded rather than constraining it. The client sends
-- `application/octet-stream` when the browser offers nothing, because a blank
-- type is an absence rather than a value.

create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null,
  todo_id      uuid not null,
  uploader_id  uuid references public.profiles (id) on delete set null,
  filename     text not null,
  storage_path text not null unique,
  size_bytes   bigint not null,
  mime_type    text not null,
  created_at   timestamptz not null default now(),

  -- M3-18's pattern, two tables out. A file on a work item must agree with that
  -- work item about which board it is on. Without it, `board_id` is a claim the
  -- client makes and the read policy believes — an attachment could be filed
  -- under a board the uploader can reach while pointing at a card on a board
  -- they cannot.
  --
  -- ON DELETE CASCADE, for the reason M7-01 gives: a card's comments have
  -- nowhere to be rehomed to and neither do its files. It is also what makes
  -- the cascade orphan case in the header real, and why the sweep is recorded
  -- there.
  constraint attachments_todo_id_fkey
    foreign key (todo_id, board_id) references public.todos (id, board_id)
    on delete cascade,

  -- Both refused by the database rather than by the picker, per Enforcement
  -- rule 6: an invariant that must hold for every writer belongs in a
  -- constraint. `btrim` covers the whitespace-only name a `<> ''` check would
  -- let through. There is no maximum length — no other text column in this
  -- schema has one.
  constraint attachments_filename_not_blank check (length(btrim(filename)) > 0),
  constraint attachments_size_non_negative  check (size_bytes >= 0)
);

comment on table public.attachments is
  'Files on a work item. Metadata only — the bytes live in the private '
  'task-attachments bucket at storage_path. Editors and above may upload; the '
  'uploader, admins and owners may delete. board_id is the policy key and is '
  'pinned to the work item''s board by attachments_todo_id_fkey.';

comment on column public.attachments.uploader_id is
  'Who attached it. Nullable and ON DELETE SET NULL — unlike '
  'comments.author_id, a file is a contribution to a shared work item rather '
  'than its uploader''s own words, so deleting the account must not take the '
  'file with it. Follows todos.creator_id.';

comment on column public.attachments.storage_path is
  'The object key in the task-attachments bucket: '
  '<board_id>/<todo_id>/<attachment_id>.<ext>. UNIQUE, so the row and the '
  'object are one pair. Carries no user-supplied text — the display name is '
  'in filename — because the first path segment is what the storage policies '
  'read as the board.';

comment on column public.attachments.board_id is
  'Denormalised from the work item so every policy is one hop. Cannot drift '
  'from todos.board_id — the composite foreign key refuses it.';


-- 3. Index ----------------------------------------------------------------------
--
-- The only query is one work item's list in upload order
-- (`todo_id=eq.X&order=created_at`), so `(todo_id, created_at)` answers it as a
-- range scan with no sort node, and its leading column also serves the
-- referencing side of the composite FK when a work item is deleted. This is
-- `comments_todo_created_idx` with the names changed.
--
-- No index on `board_id`. Nothing lists a board's attachments — there is no
-- board-wide file view and no moderation screen outside a task — and an index
-- for a query nobody makes is a write cost with no reader.
--
-- No index on `storage_path` beyond the one the UNIQUE constraint already
-- builds, which is what section 6's DELETE policy looks the object up through.

create index if not exists attachments_todo_created_idx
  on public.attachments (todo_id, created_at);


-- 4. RLS ------------------------------------------------------------------------

alter table public.attachments enable row level security;


-- Read: any member, through the same predicate every board-scoped table uses.
-- Not `board_role(board_id) is not null` — `accessible_board_ids()` is the
-- single swap point, and a set-returning no-argument function is planned as an
-- InitPlan evaluated once per statement rather than once per row. A file is
-- visible under exactly the same rule as the card it hangs off.
--
-- Note what this grants a viewer: reading the row, and therefore the
-- `storage_path` needed to ask for a signed URL. That is intended — a viewer
-- may read and download everything on a board they belong to, and section 6's
-- SELECT policy agrees. What they may not do is add or remove.
drop policy if exists "Members select attachments" on public.attachments;
create policy "Members select attachments" on public.attachments
  for select to authenticated
  using (board_id in (select public.accessible_board_ids()));


-- Write: editor and above, spelled out rather than `is_board_member(board_id)`.
-- The list IS the decision — it says "viewer is not here" in the place someone
-- will look when they doubt it — and it fails closed if a fifth role is ever
-- added, where a membership test would silently admit it. `board_role` returns
-- NULL for a non-member and NULL fails WITH CHECK, so non-membership is denied
-- by the same expression.
--
-- `uploader_id = auth.uid()` is what stops a member attributing an upload to
-- somebody else. PostgREST would happily send any uuid in that column, and the
-- column is nullable — so an explicit NULL would satisfy a policy that only
-- checked the role. It does not satisfy this one: `null = auth.uid()` is null,
-- which is not true. An upload always names its uploader; only a later account
-- deletion can blank it.
drop policy if exists "Editors and above insert attachments" on public.attachments;
create policy "Editors and above insert attachments" on public.attachments
  for insert to authenticated
  with check (
    uploader_id = (select auth.uid())
    and public.board_role(board_id) in ('owner', 'admin', 'editor')
  );


-- Delete: your own, or anyone's if you administer the board. The two halves are
-- different powers and the OR is the whole of the difference — an editor
-- reaches only the files they uploaded, an admin reaches every file on the
-- board. This is M7-01's comment moderation rule, reused rather than
-- re-decided, which is what M32 asked for.
--
-- The second half re-checks membership rather than trusting `uploader_id`
-- alone: a person removed from a board still matches rows they uploaded while
-- they were on it, and they should not be able to reach back in and delete
-- them. `board_role` returning NULL is what stops that.
--
-- Note what this does NOT grant: an admin on board A has no path to an
-- attachment on board B, because both halves resolve `board_role` on the row's
-- own `board_id`, and that column cannot lie (section 2).
drop policy if exists "Uploaders and moderators delete attachments" on public.attachments;
create policy "Uploaders and moderators delete attachments" on public.attachments
  for delete to authenticated
  using (
    public.board_role(board_id) in ('owner', 'admin')
    or (
      uploader_id = (select auth.uid())
      and public.board_role(board_id) in ('owner', 'admin', 'editor')
    )
  );


-- No UPDATE policy, and section 7 grants no UPDATE privilege either. An
-- attachment is immutable: every column is either the identity of a stored
-- object or a fact about the bytes that were stored. There is no field an edit
-- could legitimately touch, so rather than narrowing UPDATE with a column grant
-- the way `comments` narrows it to `content`, the verb does not exist here at
-- all. A rename is a delete and a re-upload.


-- 5. Bucket ---------------------------------------------------------------------
--
-- **This is the first bucket this repository creates.** `avatars` predates the
-- migration discipline — it was made in the Dashboard, which is why M14 could
-- only ever `update` its configuration and why `docs/RLS_AUDIT.md` had to be
-- written from a schema dump. CLAUDE.md is explicit that "a change made in the
-- dashboard is a change that does not exist", so this one is created in SQL and
-- establishes the pattern the next bucket copies.
--
-- Idempotent by `on conflict`, like every other statement in this file: the
-- three configuration columns are re-asserted rather than left to whatever a
-- previous application or a dashboard edit set them to. `public = false` is
-- re-asserted for the same reason — a bucket flipped public by hand is exactly
-- the drift this discipline exists to catch, and re-running the migration is
-- then the fix.
--
-- 26214400 is 25 MiB. A ceiling and NOT a mime allow-list, which is where this
-- deliberately parts from the avatar bucket: M14 added `allowed_mime_types` so
-- that "avatar" would mean an image, and that is a content rule for a bucket
-- whose whole purpose is one content type. Attachments have no such purpose and
-- the product requirement is explicitly not to restrict file types, so the
-- allow-list is NULL. The size limit stays, because it is an operational bound
-- rather than a statement about what a file may be — and because it is enforced
-- by storage itself, the client's own check is UX exactly like every permission
-- check in this app.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 26214400, null)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = null;


-- 6. Storage policies -----------------------------------------------------------
--
-- Three policies, and they are the object-level mirror of section 4. Every
-- clause leads with `bucket_id = 'task-attachments'` — RLS on
-- `storage.objects` is global across buckets, so a clause missing it would
-- widen `avatars` as a side effect.
--
-- `storage.foldername(name)` returns the path segments WITHOUT the filename, so
-- `<board>/<todo>/<id>.pdf` yields `{<board>, <todo>}` and `[1]` is the board.
-- A root-level object yields `{}`, whose `[1]` is null, and `null = anything` is
-- null — never true. That is what makes anything outside the two-segment layout
-- unreachable, which is the correct outcome.


-- Read: board membership, compared TEXT TO TEXT.
--
-- The direction matters and it is the one the avatar policy already uses
-- (`= (select auth.uid())::text` — the uuid is cast, not the path). Casting the
-- path segment instead (`(storage.foldername(name))[1]::uuid in (...)`) would
-- read the same but behaves differently on a malformed name: a cast that cannot
-- parse raises 22P02 rather than returning false, and in a SELECT policy — which
-- is evaluated against every candidate row — one bad object name would turn
-- into a hard error for every reader of the bucket. Casting the helper's own
-- output cannot fail, so it is the read path that gets the safe form.
-- The helper is called in FROM rather than in the target list. Both forms work
-- — a set-returning function is expanded either way since PG10 — but the FROM
-- form is the one whose meaning does not depend on knowing that, and it gives
-- the cast something named to attach to.
drop policy if exists "Members read board attachments" on storage.objects;
create policy "Members read board attachments"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] in (
      select board::text from public.accessible_board_ids() as board
    )
  );


-- Write: editor and above on the board named by the first segment.
--
-- This one DOES cast the segment, because `board_role` takes a uuid and there
-- is no set-returning "boards I may write" helper to compare text against.
-- Writing one was considered and refused: `20260810120000` records that the
-- role list is spelled out six times precisely because a policy cannot be
-- parameterised, and names the point at which a `writable_board_ids()` helper
-- would earn its place. One caller is not that point.
--
-- The cast's failure mode is stated rather than left to be discovered: a first
-- segment that is not a uuid raises 22P02. That FAILS CLOSED — the insert is
-- refused with an error instead of a clean denial — and it is only reachable by
-- a caller hand-crafting a key, because the client mints
-- `<board_id>/<todo_id>/<attachment_id>.<ext>` and every part of that is a uuid
-- it already holds. A root-level object takes the null path instead and is
-- denied quietly.
--
-- `array_length(... , 1) = 2` pins the layout to exactly two folders, so
-- nothing can be dropped at the bucket root or buried under a deeper prefix the
-- read policy would still match on its first segment.
drop policy if exists "Editors and above write board attachments" on storage.objects;
create policy "Editors and above write board attachments"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'task-attachments'
    and array_length(storage.foldername(name), 1) = 2
    and public.board_role(((storage.foldername(name))[1])::uuid)
        in ('owner', 'admin', 'editor')
  );


-- Delete: keyed on the ROW rather than on the path.
--
-- This needs no cast at all — it reads `board_id` off the attachment itself,
-- which is a uuid column — and more importantly it is not an approximation of
-- section 4's DELETE policy, it is the same expression over the same row. That
-- equivalence is load-bearing: the client removes the object BEFORE the row, so
-- a storage delete that succeeds has to predict a row delete that will, or a
-- file would vanish out from under a row nobody can now remove.
--
-- The subquery runs under the caller's own RLS, so `attachments` SELECT applies
-- to it — which only ever narrows the result, and narrowing a delete gate is
-- safe.
--
-- The consequence, stated because it is a real limitation and not an oversight:
-- an object whose row is already gone matches nothing and CANNOT be deleted by
-- any client. That is the cascade orphan case in the header, and it is why the
-- sweep query there is run as `service_role`, which bypasses RLS entirely.
--
-- No UPDATE policy. Objects here are written once and never overwritten;
-- `upsert` is an avatar concern, where one person has one avatar and replacing
-- it is what keeps the bucket from accumulating one object per upload.
drop policy if exists "Uploaders and moderators delete board attachments" on storage.objects;
create policy "Uploaders and moderators delete board attachments"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and exists (
      select 1
      from public.attachments a
      -- Qualified with the policy table's own correlation name, not left bare.
      -- `attachments` has no `name` column today, so `name` alone would resolve
      -- outwards and work — and would silently rebind to the inner table the
      -- day somebody adds one, turning this into `a.name = a.storage_path`,
      -- which is false for every row and would lock every object in the bucket.
      where a.storage_path = objects.name
        and (
          public.board_role(a.board_id) in ('owner', 'admin')
          or a.uploader_id = (select auth.uid())
        )
    )
  );


-- 7. Grants ---------------------------------------------------------------------
--
-- The revoke is not redundant: the linked project carries
-- `alter default privileges ... grant all on tables to anon`, so a table
-- created here starts out granted to anon. Revoke first, then grant back
-- exactly what is wanted. M3-13, M4-01, M18 and M7-01 all record this.
--
-- **No UPDATE, in any form.** `comments` narrows UPDATE to a single column
-- because an author may legitimately edit their own text; there is no
-- equivalent here, so the privilege is simply absent. A PATCH against this
-- table is refused with 42501 before any policy is consulted, which is the
-- cheapest possible statement of "an attachment is immutable".

revoke all on table public.attachments from anon;
revoke all on table public.attachments from authenticated;

grant select, insert, delete on table public.attachments to authenticated;
grant all                    on table public.attachments to service_role;


-- 8. What is deliberately NOT here ----------------------------------------------
--
-- · **Realtime.** `attachments` is not added to the `supabase_realtime`
--   publication, on M7-01's precedent (comments were not either; M7-04 added
--   them later, with their teardown, rather than retrofitting a subscription to
--   a table that was already replicating). There is a second reason specific to
--   this table: REPLICA IDENTITY stays DEFAULT, so a DELETE payload is the
--   primary key and nothing else — a receiving client would learn an id but
--   never the `storage_path` it should forget.
--
-- · **A `cache.ts` in the service folder.** `todos/`, `columns/` and
--   `comments/` each have one because a realtime callback cannot reach into an
--   `onMutate`, so the transformations have to live outside the closures. With
--   no realtime consumer there is one caller for one filter, and the file would
--   be its shape without its reason. It arrives with realtime.
--
-- · **A scheduled orphan sweep.** The query is in the header and the client
--   covers every path except cascade. `prune_activities(int)` is the precedent
--   if one is ever wanted, and PH-01 is the trigger.
--
-- · **Inline previews, versioning, and drag-to-upload onto a card.** All three
--   are in M32's own *explicitly not* list.
--
-- · **A comment ↔ attachment link.** M26 lists comment attachments as "M32 plus
--   a decision", and the decision has not been made. Nothing here forecloses
--   it: an `attachments.comment_id` is a later additive column.
--
-- · **An activity trigger.** M18's event list is a CHECKed (entity_type, action)
--   pair and widening it is that milestone's decision, not this one's. Uploading
--   a file does not appear in the History tab yet, and the CHECK is what makes
--   that a visible gap rather than a blank row.


-- 9. Rollback -------------------------------------------------------------------
--
-- Forward-fix, per Rule 4 — migrations here have no `down`. Reversing means a
-- new migration containing:
--
--   drop policy if exists "Members read board attachments" on storage.objects;
--   drop policy if exists "Editors and above write board attachments" on storage.objects;
--   drop policy if exists "Uploaders and moderators delete board attachments" on storage.objects;
--   drop table if exists public.attachments;   -- takes its policies and index
--   delete from storage.buckets where id = 'task-attachments';
--
-- Order matters twice. The storage policies go first because the DELETE one
-- references `public.attachments` and dropping the table under it would leave a
-- policy that errors on evaluation. The bucket row goes last because storage
-- refuses to delete a bucket that still holds objects — which is the useful
-- failure: it means the reversal has to confront the files before it discards
-- the rows that describe them.
--
-- **This reversal destroys user data in a way the migration did not create it.**
-- Dropping the table discards every file's metadata, and the objects then have
-- no rows and cannot be deleted through any client. Tier A describes applying
-- this migration, not undoing it.
--
--
-- 10. Verification --------------------------------------------------------------
--
-- **Every policy in this file was exercised before it shipped**, which is a
-- first for a migration here: M14's storage checklist and M3-16's role matrix
-- were both written and left unrun. `scripts/verify-m32-attachments.sql` seeds
-- two boards and six users, switches to `authenticated` with a real
-- `auth.uid()`, and asserts 29 outcomes across `public.attachments` and
-- `storage.objects`. It ends in ROLLBACK.
--
-- Run against a shadow database — all 64 migrations applied to a container from
-- this project's own Postgres image — 29/29 passed on 2026-09-03, with the
-- table's grants and the bucket's three configuration columns checked as well.
--
-- Separately, on the same date, `supabase start` applied all 64 migrations to a
-- **local Supabase stack**, so this file has also been through the CLI's own
-- apply path against the **real** `storage` schema rather than the shadow's
-- stand-in for it. That matters for section 6 specifically: those three policies
-- reference `storage.objects` columns and `storage.foldername`, and only a real
-- apply proves the references resolve against the genuine article.
--
-- **Both are database-level proofs, not REST-level ones**: PostgREST and
-- storage-api sit above these policies and the list below is still owed against
-- the real project.
--
-- `scripts/verify-m3-16-role-matrix.sql` is deliberately NOT extended — the
-- 2026-08-29 risk register records that it has not been re-run against the
-- linked project since 2026-08-14, so a new section there would be unrun code
-- claiming to be a check. This milestone's checks live in their own file, which
-- has been run.
--
-- **One expectation in the original draft of this list was wrong, and the run
-- is what found it.** "insert with a board_id that is not the work item's" was
-- written as 23503, the composite FK. It is 42501: the INSERT policy resolves
-- `board_role` on the *claimed* board and refuses a non-member before the key
-- is ever evaluated. Authorization answers first, which is the order to want —
-- and it means the composite key is only reachable by a caller the policy has
-- already let through on both boards. The script tests both paths separately.
--
-- What is still owed, at REST level, with two accounts on two boards:
--
--   TABLE — all verified at SQL level; the open question is only the status
--   code PostgREST reports for each.
--   * viewer  select attachments on their board          → rows
--   * viewer  insert                                     → 42501
--   * editor  insert with uploader_id = self             → 201
--   * editor  insert with uploader_id = another user     → 42501
--   * editor  insert with uploader_id = null             → 42501
--   * editor  insert claiming a board they are not on    → 42501 (policy first)
--   * editor  insert, member of both, mismatched pair    → 23503 (composite FK)
--   * editor  delete own                                 → 204
--   * editor  delete another member's                    → 0 rows
--   * admin   delete another member's                    → 204
--   * any     patch any column                           → 42501 (no grant)
--   * any     insert with blank or whitespace filename   → 23514
--   * any     insert with size_bytes < 0                 → 23514
--   * non-member select on that board                    → 0 rows
--   * anonymous select                                   → 42501
--   * deleting the work item cascades its attachments    → 0 rows left
--
--   STORAGE — the policy expressions are verified; what only a REST run can
--   show is storage-api's own layer on top of them.
--   * editor  upload to <their board>/<todo>/<uuid>.pdf  → 200
--   * editor  upload to <another board>/…                → 403
--   * editor  upload to the bucket root                  → 403 (array_length)
--   * editor  upload to a three-folder path              → 403 (array_length)
--   * editor  upload under a non-uuid folder             → 22P02, fails closed
--   * viewer  upload anywhere                            → 403
--   * viewer  read, and createSignedUrl, on their board  → 200
--   * non-member read                                    → 0 rows
--   * editor  delete their own object                    → 200
--   * editor  delete another member's object             → 403
--   * admin   delete another member's object             → 200
--   * editor  upload into the `avatars` bucket via these
--             policies                                   → 403 (bucket clause)
--
--   NOT COVERED BY THE SCRIPT, and genuinely REST-only:
--   * anonymous GET of the object path directly          → 403 (private bucket)
--   * anonymous GET of a signed URL after it expires     → 400
--   * upload a 26 MiB file            → rejected by the bucket's size limit
--   * upload with no Content-Type     → accepted; there is no allow-list

-- M22 · notifications — the inbox. SAFE. Tier B (new table, no data touched).
--
-- **Read state is the reason this table exists.** Everything an inbox would
-- show is already in the schema: `board_invites` holds invitations addressed to
-- you, and `activities` already records `('todo','assigned')` with the old and
-- new assignee in its payload. What is nowhere — and cannot be derived from
-- anything — is whether *you have seen it*. That single fact is what turns a
-- feed into an inbox, and it needs somewhere to live.
--
-- Two shapes were considered and rejected before this one:
--
--   · **A `read_at` column on `activities`.** Wrong cardinality. An activity is
--     one board event seen by every member, so "read" is per (person, event) —
--     a column on the event can only record one person's opinion.
--   · **A `notification_reads` join table over `activities`.** No new event
--     model, but the inbox is then a cross-board query against a board-scoped,
--     board-indexed table, filtered on a jsonb payload to find the rows that
--     concern *you*. That is a sequential scan per inbox open, and it cannot
--     express an invitation at all, since an invite is not a board activity.
--
-- So: one narrow table, per recipient, written only by triggers.
--
--
-- WHY THE CLIENT CANNOT WRITE IT
-- ---------------------------------------------------------------------------
--
-- There is **no insert policy and no insert grant** — the same discipline
-- `activities` uses (20260815090000) and for the same reason. If a client could
-- insert a notification it could forge one, and an inbox you can forge entries
-- in is not evidence of anything. The only writers are the two trigger
-- functions below, which run as the definer.
--
-- UPDATE is granted, but narrowly: it exists so you can mark your own rows
-- read, and both USING and WITH CHECK pin `user_id = auth.uid()` so a row
-- cannot be updated into somebody else's inbox.
--
--
-- WHY TITLES ARE DENORMALISED
-- ---------------------------------------------------------------------------
--
-- `payload` carries the board title and the work item's title as they were when
-- the event happened. The inbox is a cross-board surface, so resolving them by
-- join would mean reading `boards` and `todos` for every row — the request per
-- board pattern the For You page was explicitly built to avoid. It also keeps
-- a notification legible after the thing it refers to is renamed or deleted,
-- which is what you want from a record of something that happened.
--
--
-- BLAST RADIUS
-- ---------------------------------------------------------------------------
--
-- Tier B. One new table, two triggers on existing tables. **No existing column,
-- policy or query changes**, and both triggers are AFTER triggers that only
-- INSERT elsewhere — neither can fail the statement that fired it under normal
-- operation, and both are written to no-op rather than raise when they cannot
-- resolve a recipient. That matters: a raise in the invite trigger would make
-- `create_invite` fail, and a raise in the assignment trigger would make a card
-- undraggable.


-- 1. The table ----------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),

  -- Whose inbox. Cascade, because a deleted account's inbox is not a record
  -- anyone needs and there is no audit requirement on it.
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- Checked text rather than an enum, matching `columns.category` and
  -- `todos.type`: a fixed set the product picks from and users never define,
  -- and widening it is an ALTER rather than a type migration.
  type text not null check (type in ('invite', 'assigned')),

  -- Where it happened. Nullable because a future notification type may not
  -- belong to a board; cascade so deleting a board clears its noise.
  board_id uuid references public.boards (id) on delete cascade,

  -- What to open. Deliberately NOT a foreign key: the row must survive the
  -- thing it refers to being deleted — "you were assigned X" is still true
  -- after X is gone, and a cascade would rewrite history. The client resolves
  -- it and falls back to the payload when it no longer exists.
  entity_type text check (entity_type in ('todo', 'invite')),
  entity_id uuid,

  -- Who caused it. `set null` rather than cascade: a notification outlives the
  -- account that triggered it, and the payload keeps the name.
  actor_id uuid references public.profiles (id) on delete set null,

  -- Board title, item title, actor name — see the header on why.
  payload jsonb not null default '{}'::jsonb,

  -- Null is unread. A nullable timestamp rather than a boolean, because "when"
  -- is strictly more information than "whether" and costs the same.
  read_at timestamptz,

  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'Per-recipient inbox (M22). Trigger-written only: there is no insert grant, '
  'which is what makes an entry evidence rather than a claim. RLS is self-only.';


-- 2. Indexes ------------------------------------------------------------------
--
-- The list query is "my notifications, newest first" and the badge is "how many
-- of mine are unread". Two indexes rather than one because the second question
-- is asked on every page load and its answer is almost always small — a partial
-- index over just the unread rows stays tiny however long the table grows.

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;


-- 3. RLS ----------------------------------------------------------------------

alter table public.notifications enable row level security;

drop policy if exists "Own notifications are selectable" on public.notifications;
create policy "Own notifications are selectable" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Marking read. WITH CHECK as well as USING, so a row cannot be updated into
-- somebody else's inbox — USING alone would permit changing `user_id`.
drop policy if exists "Own notifications are markable" on public.notifications;
create policy "Own notifications are markable" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Own notifications are deletable" on public.notifications;
create policy "Own notifications are deletable" on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- No INSERT policy and no insert grant. See the header.
grant select, update, delete on public.notifications to authenticated;


-- 4. Invitations ---------------------------------------------------------------
--
-- Fires when an invite is addressed to someone who already has an account. An
-- invite to a stranger produces nothing here, correctly: there is no inbox to
-- put it in, and the token in the email is how they get in.
--
-- Matched on lowercased email because `profiles.email` mirrors what the auth
-- user registered with and `board_invites.email` is whatever the inviter typed.

create or replace function public.notify_on_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_board   text;
  v_actor   text;
begin
  if new.email is null then
    return new;
  end if;

  select p.id into v_user_id
    from public.profiles p
   where lower(p.email) = lower(new.email)
   limit 1;

  -- No account yet. Nothing to notify; the emailed token is their route in.
  if v_user_id is null then
    return new;
  end if;

  -- Never notify somebody about their own action.
  if v_user_id = new.created_by then
    return new;
  end if;

  select b.title into v_board from public.boards b where b.id = new.board_id;
  select coalesce(p.full_name, p.username) into v_actor
    from public.profiles p where p.id = new.created_by;

  insert into public.notifications
    (user_id, type, board_id, entity_type, entity_id, actor_id, payload)
  values (
    v_user_id, 'invite', new.board_id, 'invite', new.id, new.created_by,
    jsonb_build_object(
      'board_title', coalesce(v_board, 'a board'),
      'actor_name',  v_actor,
      'role',        new.role
    )
  );

  return new;
end;
$$;

drop trigger if exists board_invites_notify on public.board_invites;
create trigger board_invites_notify
  after insert on public.board_invites
  for each row execute function public.notify_on_invite();


-- 5. Assignments ---------------------------------------------------------------
--
-- Fires when `todos.assignee_id` comes to name somebody, which is the same
-- event `activities` already records as ('todo','assigned'). This does not
-- replace that row — the board's history still wants it — it adds the
-- per-recipient copy that history cannot express.
--
-- **INSERT as well as UPDATE, and that is not belt-and-braces.** `addTodo` is
-- an *upsert* (M2-14, so the optimistic row and the stored row are one row), so
-- a card created with an assignee already on it arrives as an INSERT and never
-- fires an UPDATE trigger at all. An update-only trigger would silently miss
-- every card created straight onto somebody — which is exactly what the
-- column's create form, with its assignee control, is for.
--
-- `OLD` does not exist on an INSERT, so the no-change guard is behind a TG_OP
-- test rather than written as one condition: reading `old.assignee_id` in an
-- INSERT trigger raises "record old is not assigned yet".
--
-- **Assigning something to yourself notifies nobody.** You know.

create or replace function public.notify_on_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_board text;
  v_name  text;
begin
  if new.assignee_id is null or new.assignee_id = v_actor then
    return new;
  end if;

  -- Unchanged assignee on an update is not an assignment. OLD is only
  -- addressable here because TG_OP has already ruled out the INSERT case.
  if tg_op = 'UPDATE'
     and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;

  select b.title into v_board from public.boards b where b.id = new.board_id;
  select coalesce(p.full_name, p.username) into v_name
    from public.profiles p where p.id = v_actor;

  insert into public.notifications
    (user_id, type, board_id, entity_type, entity_id, actor_id, payload)
  values (
    new.assignee_id, 'assigned', new.board_id, 'todo', new.id, v_actor,
    jsonb_build_object(
      'board_title', coalesce(v_board, 'a board'),
      'todo_title',  coalesce(new.title, 'Untitled'),
      'actor_name',  v_name
    )
  );

  return new;
end;
$$;

drop trigger if exists todos_notify_assignment on public.todos;
create trigger todos_notify_assignment
  after insert or update of assignee_id on public.todos
  for each row execute function public.notify_on_assignment();


-- Rollback ---------------------------------------------------------------------
--
-- Forward-only, per Rule 2. To reverse, put the following in a NEW migration:
--
--   drop trigger if exists todos_notify_assignment on public.todos;
--   drop trigger if exists board_invites_notify on public.board_invites;
--   drop function if exists public.notify_on_assignment();
--   drop function if exists public.notify_on_invite();
--   drop table if exists public.notifications;
--
-- Free to reverse while the table is empty. Once it holds read state, dropping
-- it discards that permanently and the drop becomes Tier B.
--
--
-- Verification -------------------------------------------------------------------
--
--   select relrowsecurity from pg_class where oid = 'public.notifications'::regclass;
--   -- expect: t
--
--   select polname, polcmd from pg_policy
--    where polrelid = 'public.notifications'::regclass order by polname;
--   -- expect exactly three: select (r), update (w), delete (d). NO insert.
--
--   select has_table_privilege('authenticated', 'public.notifications', 'INSERT');
--   -- expect: f
--
-- Both paths fire. As A, (1) assign an existing card to B and (2) create a new
-- card already assigned to B — the second is the INSERT path that an
-- update-only trigger would miss. Then as B:
--
--   select type, payload ->> 'todo_title' from notifications;
--   -- expect: B sees BOTH rows
--
-- and as A:
--
--   select count(*) from notifications;
--   -- expect: 0 — A caused it and is not its recipient
--
-- And that the client cannot forge one, as any user:
--
--   insert into notifications (user_id, type) values (auth.uid(), 'assigned');
--   -- expect: 42501, permission denied for table notifications

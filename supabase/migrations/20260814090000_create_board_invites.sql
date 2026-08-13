-- M4-01 · Create board_invites. SAFE. Tier A.
--
-- The table that lets someone who is NOT YET A MEMBER become one.
--
-- M3 gave the board a membership model, but its only mutation path,
-- add_board_member(board, user_id, role), needs the target's profile id — a
-- thing the inviter cannot know before the invitee has an account. This table
-- is the missing indirection: the invite carries the ROLE, a random TOKEN
-- stands in for the person, and whoever presents the token becomes the member.
--
-- Purely additive. Nothing reads it yet: M4-02 writes rows, M4-03 consumes
-- them, M4-04 lists them. The running application is unaffected.
--
--
-- SCOPE DECISION — link invites only (docs/IMPLEMENTATION_PLAN.md, M4).
--
-- `email` exists and stays nullable, unused in v1. Email invitations need a
-- transactional provider, deliverability handling and bounce logic — real work
-- for no additional capability. Keeping the column means email invites are an
-- additive change later rather than a migration of this table.
--
--
-- REVOCATION IS A DELETE, which is why there is no `revoked_at`.
--
-- M4-03's revoke_invite() deletes the pending row. A revoked token then fails
-- through exactly the same branch as a token that never existed, so there is
-- no third state for accept_invite to reason about and no way to tell the two
-- apart from outside. The audit trail survives because revoke_invite REFUSES
-- to delete a row whose accepted_at is set — a consumed invite is history, and
-- removing the person it admitted is remove_board_member's job, not this
-- table's.


-- 1. The table ----------------------------------------------------------------
--
-- `role` carries the check WITHOUT 'owner'. This is invariant I6 — ownership
-- is not grantable — made INEXPRESSIBLE rather than merely unreachable: no
-- code path, RPC or direct write, can put 'owner' in this column. M4-03 checks
-- for it anyway, as defence in depth behind this line.
--
-- `created_by` is `on delete set null`, not cascade, and deliberately unlike
-- boards.owner_id: deleting the inviter's account must not silently void a
-- live invitation that someone else is about to accept. The FK exists to keep
-- the reference honest, not to own the row's lifetime.
--
-- `board_id` cascades, like every other board-scoped table: deleting a board
-- takes its pending invites with it, or they would be links to nothing.
--
-- `expires_at` is NOT NULL with no default. An invite that never expires is a
-- credential with no end, and a default here would let a direct writer create
-- one by omission. M4-02 computes it from a clamped argument; the column
-- refuses to be silent about it.
--
-- `token` is text rather than uuid: M4-02 fills it with 24 CSPRNG bytes hex
-- encoded (192 bits), not a v4 uuid (122 bits, and a recognisable shape).

create table if not exists public.board_invites (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards(id) on delete cascade,
  email       text,
  token       text not null unique,
  role        text not null
    check (role in ('admin', 'editor', 'viewer')),
  expires_at  timestamptz not null,
  created_by  uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.board_invites is
  'Pending board invitations. The token is the credential: whoever presents it '
  'to accept_invite() joins the board with the role stored here. Created and '
  'revoked through RPCs only — there is no client write policy. Revocation '
  'deletes the row; an accepted row is kept as the audit trail.';

comment on column public.board_invites.email is
  'Reserved for email invitations, which v1 does not send. Always null today.';


-- 2. Indexes -------------------------------------------------------------------
--
-- Two, and no more. `unique (token)` above already builds the btree that
-- accept_invite's lookup rides on — the one query that must be fast on a table
-- scan of every invite in the system. board_id serves the pending list, which
-- is always scoped to one board.
--
-- No index on accepted_at or expires_at: M4-07 filters them, but only within a
-- single board's handful of rows, which the board_id index has already reduced.

create index if not exists board_invites_board_id_idx
  on public.board_invites (board_id);


-- 3. Row-level security ---------------------------------------------------------
--
-- ONE POLICY, SELECT ONLY, for owners and admins of the board.
--
-- Through public.board_role(), never a sub-select on board_members — the M3-02
-- helper is SECURITY DEFINER, so the read it performs does not re-enter policy
-- evaluation. A non-member gets NULL from it, and `null in ('owner','admin')`
-- is NULL, which USING treats as a failure. So non-membership is denied by the
-- same expression that grants the admin case, with no separate branch.
--
-- ⚠ WHY OWNERS AND ADMINS MAY READ THE TOKEN. They are exactly the people
-- allowed to mint one (M4-02), and the pending list has to offer "copy link"
-- for an invite created ten minutes ago. Handing them a value they could
-- create for themselves is not an escalation. Nobody else can read this table
-- at all — in particular THE INVITEE CANNOT READ THEIR OWN INVITE BY TOKEN.
-- Acceptance goes through accept_invite(), which is SECURITY DEFINER and
-- returns two fields; there is no path that lets a token holder query the row.
--
-- No INSERT, UPDATE or DELETE policy, and it must never get one. With RLS on
-- and no permissive policy for a verb, that verb is denied outright. Creation
-- and revocation are RPCs for the same reason membership mutations are: the
-- authorization rules are rank arithmetic, and a policy cannot express "an
-- admin may invite an editor but not another admin".

alter table public.board_invites enable row level security;

drop policy if exists "Admins select board invites" on public.board_invites;
create policy "Admins select board invites" on public.board_invites
  for select to authenticated
  using (public.board_role(board_id) in ('owner', 'admin'));


-- 4. Grants ----------------------------------------------------------------------
--
-- The revoke is not redundant. The linked project carries
--
--   alter default privileges for role postgres in schema public
--     grant all on tables to anon;
--
-- (captured in the baseline dump), so a table created here is granted to the
-- publishable key that ships in the client bundle the moment it exists. The
-- policy above is `to authenticated`, so anon would read nothing — but the
-- grant would be real, and M3-13 recorded that `anon` and `authenticated` held
-- all eight privileges on board_members including TRUNCATE, which RLS does not
-- filter. Two independent mistakes deep is the standard this table starts at.
--
-- `authenticated` gets SELECT and nothing else: the policy narrows which rows,
-- the grant narrows which verbs, and the write path is the RPCs.

revoke all on table public.board_invites from anon;
revoke all on table public.board_invites from authenticated;

grant select on table public.board_invites to authenticated;
grant all    on table public.board_invites to service_role;


-- Rollback -------------------------------------------------------------------------
--
-- Forward-only. To reverse, put this in a NEW migration:
--
--   drop policy if exists "Admins select board invites" on public.board_invites;
--   drop index  if exists public.board_invites_board_id_idx;
--   drop table  if exists public.board_invites;
--
-- Clean while this is the last M4 migration applied: nothing references the
-- table. It stops being clean at M4-02 and M4-03, whose functions read and
-- write it. Dropping the table with live pending invites invalidates every
-- outstanding link — memberships already created by accept_invite are
-- unaffected, since they live in board_members.
--
--
-- Verification ---------------------------------------------------------------------
--
--   -- shape
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'board_invites' order by ordinal_position;
--
--   -- 'owner' is not a role this column can hold
--   insert into public.board_invites (board_id, token, role, expires_at)
--   values ('<board>', 'x', 'owner', now() + interval '1 day');
--   -- expect: check violation on board_invites_role_check
--
--   -- one token, one invite
--   insert into public.board_invites (board_id, token, role, expires_at)
--   values ('<board>', 'dup', 'viewer', now() + interval '1 day');  -- twice
--   -- expect: unique violation on the second
--
--   -- privileges: authenticated holds SELECT and nothing else, anon nothing
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_name = 'board_invites' and grantee in ('anon','authenticated')
--   order by grantee, privilege_type;
--
--   -- the read boundary, as two real sessions (scripts/verify-m4-invites.sql
--   -- §13 asserts the policy shape; this is the HTTP-level half):
--   curl "$URL/rest/v1/board_invites?select=token" -H "apikey: $ANON"
--   -- expect [] for anon, [] for a viewer/editor, the board's rows for an admin

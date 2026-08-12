-- M3-15 · Owner immutability, enforced for every writer. HIGH RISK. Tier A.
--
-- M3-14 enforces the Owner invariants for callers of its four RPCs. A function
-- cannot constrain a writer that does not call it, so service_role, a future
-- SECURITY DEFINER function, a migration, or an admin screen written in six
-- months could still write an owner row directly. This closes that.
--
-- The M2-21 todos_assign_board_key trigger is the precedent: an invariant every
-- writer must satisfy belongs in a trigger, not in one function's body.
--
-- Invariant numbering is Part II's, which is the source of truth.
--
--   I1  a board always has exactly one Owner
--   I2  the Owner's membership row cannot be DELETED, by any actor
--   I3  the Owner's role cannot be CHANGED, by any actor
--   I4  an admin has no path to an Owner-held row at all
--   I5  boards.owner_id and the owner membership row never drift apart
--   I6  changing who the Owner is is not a membership operation
--
-- What this migration adds, per invariant:
--
--   I1  BEFORE INSERT refuses a second owner row for a board;
--       BEFORE UPDATE refuses promoting any row to 'owner'
--   I2  BEFORE DELETE refuses to remove an owner row
--   I3  BEFORE UPDATE refuses to change an owner row's role
--   I5  BEFORE INSERT requires a new owner row to match boards.owner_id, and
--       BEFORE UPDATE on boards freezes owner_id — together the two sources
--       cannot diverge
--   I6  no path here can move ownership; boards.owner_id is immutable until an
--       explicit transfer operation exists to lift it
--
-- I4 is unchanged and remains M3-14's — an admin never reaches an owner row
-- because the RPCs refuse before the rank gate. This migration is the second
-- layer beneath that, not a replacement for it.
--
--
-- SERVICE_ROLE IS NOT EXEMPT. Decided per the plan's recommendation.
--
-- Triggers fire regardless of the writing role, so no exemption is the default
-- and none is added. An exemption is a hole that exists precisely when someone
-- is operating under pressure. When ownership transfer is built it should be a
-- function that lifts the invariant explicitly and transactionally, not a role
-- that sits quietly outside it.
--
-- Two residual bypasses remain, both requiring table ownership or superuser,
-- and both out of scope here: TRUNCATE does not fire row triggers, and
-- ALTER TABLE ... DISABLE TRIGGER exists. Neither is reachable by any client —
-- M3-13 left `authenticated` with SELECT only on board_members.
--
--
-- ⚠ THE CASCADE PROBLEM — the reason this migration is not four lines.
--
-- Three foreign keys legitimately delete owner rows:
--
--   board_members.board_id → boards(id)    on delete cascade
--   board_members.user_id  → profiles(id)  on delete cascade
--   boards.owner_id        → profiles(id)  on delete cascade
--
-- So deleting a board deletes its owner membership, and deleting a person
-- deletes their boards AND their memberships. A BEFORE DELETE trigger that
-- simply refuses every owner row would break board deletion (M8-03) and
-- account deletion, and M8-08 exists to verify exactly those cascades.
--
-- The guard therefore allows a delete when the PARENT IS ALREADY GONE: the
-- referential-action trigger deletes the parent first, so by the time the
-- cascade reaches board_members the boards or profiles row is no longer
-- visible to the trigger's snapshot. A direct `delete from board_members`
-- leaves both parents in place and is refused.
--
-- This narrows the escape hatch to exactly the cascade case. It is verified
-- empirically in scripts/verify-m3-15-owner-immutability.sql rather than
-- assumed, because the whole migration hinges on it.


-- 1. Captured pre-change state -------------------------------------------------
--
-- No trigger of any kind exists on board_members. The triggers on `boards` are:
--
--   boards_add_owner_membership   AFTER INSERT  (M3-03)  — mints the owner row
--   boards_set_updated_at         BEFORE UPDATE (M2-04)  — timestamp bookkeeping
--
-- board_members writers before this migration, all of which must still work:
--
--   add_owner_membership()                (M3-03) inserts the owner row
--   add_board_member / set_member_role /
--     remove_board_member / leave_board   (M3-14) never touch an owner row
--
-- No migration updates or deletes an owner row. Verified by grep over
-- supabase/migrations: the only UPDATE/DELETE statements against
-- board_members are M3-14's, and each refuses the owner before writing.


-- 2. Guard on board_members -----------------------------------------------------
--
-- SECURITY DEFINER so the boards/profiles lookups see the true state rather
-- than an RLS-filtered view of it, whoever is writing. Same reasoning and same
-- grant posture as add_owner_membership().

create or replace function public.enforce_owner_membership_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Non-owner rows are none of this trigger's business.
    if old.role <> 'owner' then
      return old;
    end if;

    -- Cascade escape hatch 1: the board itself is being deleted, so its
    -- memberships go with it. The boards row is already gone at this point.
    if not exists (select 1 from public.boards b where b.id = old.board_id) then
      return old;
    end if;

    -- Cascade escape hatch 2: the person is being deleted. Covers deleting a
    -- profile regardless of which of the two cascades reaches this table
    -- first, since their ordering is not guaranteed.
    if not exists (select 1 from public.profiles p where p.id = old.user_id) then
      return old;
    end if;

    raise exception
      'I2: the board owner''s membership cannot be deleted (board %, user %)',
      old.board_id, old.user_id
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    -- I3: an owner row's role, and its identity, are frozen.
    if old.role = 'owner'
       and (new.role     is distinct from old.role
         or new.user_id  is distinct from old.user_id
         or new.board_id is distinct from old.board_id) then
      raise exception
        'I3: the board owner''s membership cannot be changed (board %, user %)',
        old.board_id, old.user_id
        using errcode = '42501';
    end if;

    -- I1/I6: no row can be promoted into ownership. Ownership transfer is not
    -- a membership operation and does not exist.
    if new.role = 'owner' and old.role <> 'owner' then
      raise exception
        'I1/I6: ownership cannot be granted by updating a membership row'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      -- I5: a new owner row must agree with boards.owner_id. This is what
      -- stops the two sources drifting, and it is why add_owner_membership()
      -- still works — it inserts exactly boards.owner_id, from an AFTER INSERT
      -- trigger, by which point the boards row exists.
      if not exists (
        select 1 from public.boards b
        where b.id = new.board_id and b.owner_id = new.user_id
      ) then
        raise exception
          'I5: an owner membership must match boards.owner_id (board %)',
          new.board_id
          using errcode = '42501';
      end if;

      -- I1: exactly one.
      if exists (
        select 1 from public.board_members m
        where m.board_id = new.board_id and m.role = 'owner'
      ) then
        raise exception
          'I1: board % already has an owner', new.board_id
          using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  return null;
end;
$$;

comment on function public.enforce_owner_membership_immutable() is
  'Owner invariants I1, I2, I3, I5 on board_members, for every writer '
  'including service_role. Allows a delete only when the parent board or '
  'profile is already gone, which is the cascade case.';

revoke all on function public.enforce_owner_membership_immutable()
  from public, anon, authenticated;

drop trigger if exists board_members_owner_immutable on public.board_members;
create trigger board_members_owner_immutable
  before insert or update or delete on public.board_members
  for each row
  execute function public.enforce_owner_membership_immutable();


-- 3. Freeze boards.owner_id ------------------------------------------------------
--
-- The plan offered two ways to enforce I5: a trigger keeping owner_id in step
-- with the membership row, or a documented decision that owner_id is immutable
-- until ownership transfer exists. This takes the second, which is the
-- stronger and simpler of the two — nothing to keep in step if neither side
-- can move.
--
-- Combined with section 2 the two sources cannot diverge: the owner membership
-- row cannot be deleted, re-roled or re-pointed, a second one cannot be
-- created, and owner_id cannot change.
--
-- When ownership transfer is built it lifts this deliberately, in one
-- transaction, updating both sides together. That is the point of making it
-- explicit rather than leaving a role exempt.

create or replace function public.enforce_board_owner_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception
      'I5/I6: boards.owner_id is immutable; ownership transfer does not exist (board %)',
      old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.enforce_board_owner_immutable() is
  'Freezes boards.owner_id. Half of I5 — the other half is the board_members '
  'guard. Ownership transfer, when built, lifts this explicitly rather than '
  'exempting a role from it.';

revoke all on function public.enforce_board_owner_immutable()
  from public, anon, authenticated;

drop trigger if exists boards_owner_immutable on public.boards;
create trigger boards_owner_immutable
  before update on public.boards
  for each row
  execute function public.enforce_board_owner_immutable();


-- Rollback ---------------------------------------------------------------------------
--
-- Forward-only. To reverse, put this in a NEW migration:
--
--   drop trigger if exists boards_owner_immutable on public.boards;
--   drop trigger if exists board_members_owner_immutable on public.board_members;
--   drop function if exists public.enforce_board_owner_immutable();
--   drop function if exists public.enforce_owner_membership_immutable();
--
-- No row is written by this migration, so there is nothing to restore.
--
-- If this has to be reverted because it broke a legitimate write path, the
-- likely culprit is the cascade escape hatch in section 2. Reverting restores
-- the M3-14-only posture, which is safe against every client — only direct
-- database writers regain the ability to touch an owner row.


-- Verification -------------------------------------------------------------------------
--
-- NOT YET RUN at the time of writing.
--
-- scripts/verify-m3-15-owner-immutability.sql runs the full matrix inside a
-- transaction ending in ROLLBACK. It covers, as the most privileged writer
-- available rather than through the RPCs:
--
--   direct delete of an owner row                     refused (I2)
--   direct update of an owner row's role              refused (I3)
--   direct re-point of an owner row's user_id         refused (I3)
--   promoting a non-owner row to 'owner'              refused (I1/I6)
--   inserting a second owner row                      refused (I1)
--   inserting an owner row that disagrees with
--     boards.owner_id                                 refused (I5)
--   update boards.owner_id                            refused (I5/I6)
--
-- and, because an over-broad trigger that blocks everything would pass every
-- negative case above, it also proves the legitimate paths still work:
--
--   insert/update/delete of a viewer, editor, admin   allowed
--   other columns of boards still updatable           allowed
--   creating a board still mints its owner row        allowed  (M3-03)
--   deleting a board cascades its owner row away      allowed  (the hatch)
--   deleting a profile cascades their board away      allowed  (the hatch)
--   M3-14's RPCs still behave exactly as before       allowed
--
-- The two cascade cases are the ones worth watching: they are what separates
-- this trigger from one that breaks board deletion and account deletion.

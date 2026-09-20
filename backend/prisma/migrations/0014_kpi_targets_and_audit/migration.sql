-- 0014 — KPI targets, the seniority they are keyed on, and the admin audit log.
--
-- users.seniority sits beside org_role, on users rather than profiles, for
-- 0011's reason: profiles is the public record and roster() calls its six
-- selected fields the security boundary. What someone is measured against is
-- not a fact for their co-members to read.
--
-- NULL IS A REAL STATE, NOT A MISSING VALUE (M34 D-8, D-12). A user with no
-- seniority has every factual metric like everyone else and simply has no
-- performance figure -- the UI shows "--", never "0%", because a zero would
-- be a lie about somebody nobody has classified. Such a user is excluded from
-- KPI aggregates rather than counted as zero.
--
-- kpi_targets is a TABLE, and the seed values are DATA. The requirement that
-- Junior/Middle/Senior not be hardcoded is satisfied by the rows existing and
-- all four numbers being editable -- not by a constant with an override. The
-- three-level ladder is one way of keying a target, not a property of the KPI
-- system: if targets are later keyed per user, per team or per board, that is
-- a change to this table and one lookup, not to the dashboards. Nothing in
-- the API shape or the UI may assume a user has a level.
--
-- Daily and weekly only. A monthly column is one nobody would set, and an
-- unset numeric target reads as zero, which is worse than not offering it.
--
-- admin_audit_log cannot reuse activities (D-9): activities.board_id is NOT
-- NULL with an on-delete-cascade FK and both its indexes lead with board_id.
-- A KPI edit belongs to no board, and making that column nullable would
-- change the meaning of a column every existing index and query assumes --
-- a security-boundary change to serve a logging convenience.
--
-- APPEND-ONLY, ENFORCED BY A TRIGGER RATHER THAN BY GRANTS. Revoking update
-- and delete would be the tidier statement of intent and would bind nothing:
-- this application connects as the table's owner, and an owner's rights are
-- not subject to grants. A trigger refuses the write whoever asks.
--
-- AND THAT IS WHY actor_id CARRIES NO FOREIGN KEY. It was written with
-- references profiles (id) on delete set null, and every integration suite
-- went red at once: deleting a user cascades to profiles, and setting a
-- column to null is a WRITE to this table, which the append-only trigger
-- refused -- so a single audit row made its actor undeletable.
--
-- The fix is not to carve an exception into the trigger. A log that another
-- table's deletion can rewrite is not append-only, whatever the trigger says,
-- and 'set null' would quietly erase exactly the fact the row exists to
-- record. The id is stored plainly: it says who did this, and it keeps saying
-- so after the account is gone. Readers join to profiles when they want a
-- name and accept that they may not get one.
--
-- Forward-only. Reversing means a new migration dropping both tables.

alter table users
  add column seniority text;

alter table users
  add constraint users_seniority_check
  check (seniority is null or seniority in ('junior', 'middle', 'senior'));

comment on column users.seniority is
  'Which kpi_targets row this person is measured against. NULL is a real state: no target, no performance figure, and excluded from KPI aggregates rather than counted as zero.';

create table kpi_targets (
  seniority     text primary key,
  daily_points  numeric not null,
  weekly_points numeric not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles (id) on delete set null,

  constraint kpi_targets_seniority_check check (seniority in ('junior', 'middle', 'senior')),
  constraint kpi_targets_daily_check     check (daily_points >= 0),
  constraint kpi_targets_weekly_check    check (weekly_points >= 0)
);

comment on table kpi_targets is
  'The one editable entity M34 adds. Seeded, not defaulted in code: every number here is data an operator can change.';

insert into kpi_targets (seniority, daily_points, weekly_points) values
  ('junior', 6,  30),
  ('middle', 8,  40),
  ('senior', 10, 50);

create table admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null,
  action      text not null,
  target_type text not null,
  target_id   text,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

comment on table admin_audit_log is
  'Append-only record of every superadmin write. The same shape as activities, minus the board -- which is exactly why it cannot be activities.';

create index admin_audit_log_created_idx on admin_audit_log (created_at desc);

create index admin_audit_log_actor_idx on admin_audit_log (actor_id, created_at desc);

create or replace function public.refuse_audit_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit_log is append-only'
    using errcode = '42501';
end;
$$;

comment on function public.refuse_audit_rewrite() is
  'A log that can be edited is not evidence. Enforced here rather than by revoking grants, because this application connects as the table owner and an owner is not bound by grants.';

create trigger admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function public.refuse_audit_rewrite();

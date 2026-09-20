-- 0011 — users.org_role: the first authorization axis in this schema that is
-- not board-scoped.
--
-- Every rule in this database answers "what may this person do on this board".
-- M34 needs one that answers "may this person read the whole system", and
-- M34 D-1 decides where it lives:
--
--   profiles is the PUBLIC record. roster() selects six of its fields and its
--   own comment calls those six "the security boundary, not a convenience".
--   A role there is one widened select away from telling every board member
--   who the superadmins are.
--
--   users already holds the facts nobody else may read -- password_hash,
--   email_verified_at, deactivated_at. The role belongs with those.
--
-- The four values are OrgRole in backend/src/types/actor.ts, which has carried
-- them as an optional field with one real value since B6 for exactly this
-- moment. Only 'superadmin' has behaviour in M34; 'team_lead' and 'director'
-- exist so that widening accessibleBoardIds later is an edit in one function
-- rather than a migration (BACKEND_MIGRATION_PLAN 10.7).
--
-- Expand only. 'member' is the correct value for every existing row, so there
-- is no backfill and no contract step.
--
-- THE ROLE IS GRANTED BY SQL AND BY NOTHING ELSE. M34 deliberately ships no
-- endpoint that grants it: something that hands out system-wide read is a
-- privilege-escalation surface and needs its own design and its own audit
-- trail, not a checkbox on a list screen. To appoint the first superadmin:
--
--   update users set org_role = 'superadmin' where email = 'you@example.com';
--
-- Forward-only. Reversing means a new migration dropping the column.

alter table users
  add column org_role text not null default 'member';

alter table users
  add constraint users_org_role_check
  check (org_role in ('member', 'team_lead', 'director', 'superadmin'));

comment on column users.org_role is
  'Global, non-board role. Read per request by requireSuperadmin, never baked into a token: a revoked superadmin keeping system-wide read until their access token expires is the worst version of the staleness lib/tokens.ts already refuses for board roles.';

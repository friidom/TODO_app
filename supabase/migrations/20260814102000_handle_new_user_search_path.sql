-- M14 · handle_new_user() gets an explicit search_path. SAFE. Tier A.
--
-- RLS_AUDIT item 6, and the last `SECURITY DEFINER` function in the schema
-- without one. Every function written since — accessible_board_ids, board_role,
-- is_board_member, board_roster, the membership RPCs, create_invite,
-- accept_invite — sets `search_path = ''` and schema-qualifies everything. This
-- one predates that convention: it came from the M0-05 baseline, dumped from a
-- database where it had been created by hand.
--
-- Why it matters even though the body is already qualified. A SECURITY DEFINER
-- function runs as its owner (postgres) with the *caller's* search_path unless
-- it pins one. Here the caller is the auth system inserting into auth.users, so
-- there is no attacker-controlled path today and this is hardening, not a fix —
-- which is exactly why it belongs in the milestone that is cleaning up rather
-- than in one that is shipping a feature.
--
-- The Code Review Checklist has required "explicit search_path" on new
-- SECURITY DEFINER functions since M0. This makes the oldest one agree with it.


-- 1. Prior definition, verbatim ---------------------------------------------------
--
-- From supabase/migrations/20260804000000_baseline_schema.sql:48.
--
--   CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
--       LANGUAGE "plpgsql" SECURITY DEFINER
--       AS $$
--   begin
--     insert into public.profiles (id)
--     values (new.id);
--
--     return new;
--   end;
--   $$;


-- 2. The replacement ----------------------------------------------------------------
--
-- The body is unchanged. `public.profiles` was already schema-qualified, so
-- pinning the path cannot alter behaviour — that is the whole reason this is
-- safe to apply to the signup path, which is the one code path in the product
-- that nobody can retry for a user if it breaks.
--
-- `create or replace` keeps the function's OID, so the trigger on auth.users
-- stays bound to it and no trigger is dropped or recreated. Ownership and the
-- existing grants are preserved by the same mechanism.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);

  return new;
end;
$$;


-- 3. Rollback ---------------------------------------------------------------------
--
-- Forward-fix: re-run the verbatim definition in section 1. Nothing else
-- changed, and no row was touched.


-- 4. Verification ------------------------------------------------------------------
--
-- Sign up a new account and confirm a `profiles` row appears for it, then that
-- provision_new_user() still returns its board and four columns. Those two are
-- the whole of what this function participates in.

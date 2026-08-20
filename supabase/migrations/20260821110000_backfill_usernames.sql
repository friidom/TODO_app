-- M10-01 · unique usernames, step 2 of 3: BACKFILL. SAFE. Tier B.
--
-- Makes every existing profile satisfy the rule that step 3 is about to
-- enforce. Nothing here constrains anything; it only rewrites rows that would
-- fail the index or the CHECK.
--
-- Three populations, and they are handled in one pass by the same function
-- provisioning uses, so a name settled here and a name settled at signup
-- collide the same way:
--
--   * **null** — profiles created before usernames existed, and any account
--     whose provisioning ran before this milestone. Seeded from the address's
--     local part.
--   * **badly shaped** — the old `split_part(email, '@', 1)` produced whatever
--     was in front of the @, so `ada.lovelace` and `Ada` are both already in
--     there and neither passes the CHECK.
--   * **duplicated case-insensitively** — two people whose addresses differ
--     only after the @ got the same local part. Only possible for rows written
--     before this migration, and exactly what the unique index would reject.
--
-- **Ordered by `created_at` so the outcome is not arbitrary.** When two rows
-- want `ada`, the account that existed first keeps it and the later one becomes
-- `ada2`. Processing in an undefined order would hand the plain name to
-- whichever row the planner happened to reach first, which is a different
-- answer every time this is run.
--
-- Idempotent: a row that already holds a valid, unique, normalised name is
-- skipped, so re-running changes nothing.

do $$
declare
  r record;
begin
  for r in
    select p.id, p.username, p.email
      from public.profiles p
     order by p.created_at nulls last, p.id
  loop
    -- Already correct: valid shape, already canonical, and unique. Left alone,
    -- which is what makes this safe to run twice.
    if public.is_valid_username(r.username)
       and r.username = public.normalize_username(r.username)
       and not exists (
         select 1 from public.profiles other
          where other.id <> r.id
            and lower(other.username) = lower(r.username)
       )
    then
      continue;
    end if;

    -- Seeded with the row's own id, so a profile with neither a username nor
    -- an email — there are twenty, left by the M6-14 window — gets the same
    -- generated name every time this runs rather than a fresh random one.
    update public.profiles
       set username = public.available_username(
             coalesce(
               nullif(r.username, ''),
               split_part(coalesce(r.email, ''), '@', 1)
             ),
             r.id::text
           )
     where id = r.id;
  end loop;
end;
$$;

-- Belt and braces before step 3 tries to build the index: if anything above
-- failed to resolve, fail *here*, where the message names the problem, rather
-- than inside a CREATE UNIQUE INDEX whose error is just a duplicate key.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
    from public.profiles p
   where not public.is_valid_username(p.username);

  if v_bad > 0 then
    raise exception 'backfill left % profile(s) with an unusable username', v_bad;
  end if;

  select count(*) into v_bad
    from (
      select lower(p.username)
        from public.profiles p
       group by lower(p.username)
      having count(*) > 1
    ) dupes;

  if v_bad > 0 then
    raise exception 'backfill left % duplicated username(s)', v_bad;
  end if;
end;
$$;

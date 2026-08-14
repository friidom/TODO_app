-- M14 · Avatar objects belong to their owner. HIGH RISK. Tier A.
--
-- This closes a live, exploitable authorization bug — the last one left from the
-- M0-06 audit, where it is item 3. It has had no owning task since 2026-08-05
-- because it belongs to neither the board permission model nor production
-- hardening; Appendix B recorded it as "unowned — needs a task". M14 is the
-- task.
--
-- The hole, exactly as the audit states it. RLS *is* enabled on
-- storage.objects, and all three avatar policies check only the bucket:
--
--   CREATE POLICY "Public avatars" ON storage.objects
--     FOR SELECT USING (bucket_id = 'avatars');
--
--   CREATE POLICY "Users can upload avatars" ON storage.objects
--     FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
--
--   CREATE POLICY "Users can update avatars" ON storage.objects
--     FOR UPDATE TO authenticated USING (bucket_id = 'avatars')
--                                WITH CHECK (bucket_id = 'avatars');
--
-- The client uploaded to `<uid>.<ext>` at the bucket root, so the object key was
-- literally the victim's user id. Any authenticated account could upsert to
-- `<any-uuid>.png` and replace that person's avatar. No privilege was needed
-- beyond a free account, and user ids are not secret — board_roster returns
-- `id` for every co-member by design (M3-13).
--
-- The fix is the one the audit prescribed: constrain the object path to the
-- owner, which requires the client to upload to `<uid>/avatar.<ext>`. The
-- matching client change ships in the same commit — this migration alone would
-- break avatar upload, and the client change alone would fix nothing.


-- 1. Read stays public ----------------------------------------------------------
--
-- Deliberately unchanged, and it is not the bug. Avatars are public by product
-- design: `profiles.avatar_url` holds a public URL that renders in a member
-- list, on a card and in a comment, and `getPublicUrl` signs nothing. Narrowing
-- SELECT would break every avatar in the app to fix an exposure that does not
-- exist — a profile picture is not a secret.
--
-- It also has to stay public for the objects already at the bucket root. Those
-- keep resolving through the URLs stored in `profiles.avatar_url` until their
-- owner uploads again, at which point the row points at the new path. They are
-- left in place rather than moved: rewriting other people's stored objects is a
-- data migration with a failure mode (a half-moved account has no avatar), for
-- the benefit of tidiness in a bucket nobody lists.


-- 2. Writes are scoped to the caller's own folder --------------------------------
--
-- `storage.foldername(name)` returns the path segments *without* the filename,
-- so `<uid>/avatar.png` yields `{<uid>}` and `[1]` is the uid. A root-level
-- object like `<uid>.png` yields `{}`, whose `[1]` is null, and `null = anything`
-- is null — never true. That is what makes the old flat layout unwritable by
-- anyone at all, including its owner, which is the correct outcome: the only
-- supported write path is now the scoped one.
--
-- `to authenticated` is kept from the originals. `auth.uid()` is null for anon,
-- so the comparison would fail anyway; the role clause makes the intent legible
-- and matches the shape the rest of this schema uses.

drop policy if exists "Users can upload avatars" on storage.objects;

create policy "Users upload their own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update avatars" on storage.objects;

-- Both clauses, and they are not redundant. USING decides which existing object
-- may be targeted; WITH CHECK decides what it may become. Without the second, a
-- caller could rename their own object into somebody else's folder — the same
-- old-row/new-row split M3-17 documents for `boards`.
create policy "Users update their own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- 3. Bucket limits ---------------------------------------------------------------
--
-- The audit asks for a size limit, and the reason is not storage cost: without
-- one, `upload` accepts any file of any type, so "avatar" is whatever the
-- caller says it is. A 2 MB ceiling and an explicit image allow-list make the
-- bucket's contents match its name, and both are enforced by storage itself —
-- the client's own validation is UX, exactly like every permission check in
-- this app.
--
-- **This is the one statement here that writes an existing row**, which Rule 6
-- reads as Tier B. It is classified Tier A anyway and the reasoning is stated
-- rather than assumed: the row is a two-column bucket configuration, not user
-- data, nothing is destroyed, and the prior state — no limit, no allow-list, as
-- recorded by the audit — is written into the rollback below. Reversal is a
-- copy-paste, which is exactly the property Tier A rests on.

update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'avatars';


-- 4. Rollback ---------------------------------------------------------------------
--
-- Forward-fix. The prior policy definitions are quoted verbatim at the head of
-- this file; restoring them is:
--
--   drop policy "Users upload their own avatar" on storage.objects;
--   drop policy "Users update their own avatar" on storage.objects;
--   create policy "Users can upload avatars" on storage.objects
--     for insert to authenticated with check (bucket_id = 'avatars');
--   create policy "Users can update avatars" on storage.objects
--     for update to authenticated using (bucket_id = 'avatars')
--                                 with check (bucket_id = 'avatars');
--   update storage.buckets
--      set file_size_limit = null, allowed_mime_types = null
--    where id = 'avatars';
--
-- Reverting also reopens the vulnerability, so the only reason to run it is a
-- verified break in avatar upload — and the first thing to check in that case
-- is whether the client is still writing to the flat path.


-- 5. Verification ------------------------------------------------------------------
--
-- Not run from here: the CLI exposes no arbitrary-SQL path, which is the same
-- limitation M3-16 records. What proves this, at REST level with two accounts:
--
--   * as A, upload to `<A>/avatar.png`            → 200
--   * as A, upload to `<B>/avatar.png`            → 403 (this is the bug)
--   * as A, upload to `<A>.png` at the root       → 403
--   * as A, update `<B>/avatar.png`               → 403
--   * anonymous GET of B's public avatar URL      → 200, still public
--   * upload a 5 MB file                          → rejected by the bucket
--   * upload a .pdf renamed to .png               → rejected on mime type

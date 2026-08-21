-- M23 · decline_invite — the verb the invitation API was missing. SAFE. Tier B.
--
-- Moving invitations into the notifications inbox means offering Accept **and
-- Decline** on the row. Accept already exists (`accept_invite`). Decline did
-- not, and could not be faked from what was there:
--
--   · `revoke_invite` is the wrong function. It raises 'invitation not found'
--     unless the caller is admin-or-above **on the board** — that is the
--     inviter withdrawing an invitation, not the invitee refusing one. The
--     person being invited is not a member of that board at all, so it refuses
--     them by design and would keep doing so.
--   · A client-side "dismiss" would be a lie. The row would stay pending, the
--     emailed token would still work, and the invitation would reappear in
--     `my_pending_invites` on the next load.
--
-- So this is one function: the same table, the same addressing rule, the
-- opposite outcome to accepting. No new table, no new state machine, no second
-- invitation model.
--
--
-- WHY IT DELETES RATHER THAN MARKING
-- ---------------------------------------------------------------------------
--
-- `board_invites` records acceptance by stamping `accepted_at` and keeps the
-- row as the audit trail (see 20260814090000). A *declined* invitation has no
-- equivalent column, and adding `declined_at` would mean a second nullable
-- timestamp that every reader of the table then has to test for — including
-- `my_pending_invites`, which currently means "not accepted and not expired".
--
-- Deleting is also what `revoke_invite` does, and for the same reason: the
-- invitation is withdrawn from existence rather than annotated. The inviter
-- sees it disappear from the board's pending list, which is the honest signal
-- that it will not be taken up. Re-inviting is one click and mints a new token,
-- which is the correct behaviour anyway — a declined token must not be
-- revivable.
--
--
-- WHO MAY CALL IT
-- ---------------------------------------------------------------------------
--
-- **Whoever the invitation is addressed to, and nobody else.** The rule is
-- lifted verbatim from `my_pending_invites`: the address comes from the
-- caller's own `profiles` row inside the function, never from an argument, so
-- there is no parameter anyone could point at somebody else's invitation.
--
-- It takes the **token**, not the invite id, for the same reason `accept_invite`
-- does — the token is the credential, and the caller already holds it because
-- `my_pending_invites` handed it to them. Passing an id would let someone probe
-- for the existence of invitations by uuid.
--
-- Unknown token, wrong recipient, already accepted, already expired: all return
-- **false**, indistinguishably. The caller cannot tell "no such invitation"
-- from "not yours", and the UI treats every false the same way — the invitation
-- is no longer actionable, which is true in all four cases.
--
--
-- BLAST RADIUS
-- ---------------------------------------------------------------------------
--
-- Tier B. One new function. `accept_invite`, `revoke_invite`,
-- `my_pending_invites` and `create_invite` are untouched, as is the
-- `board_invites` table, its policies and its grants. Nothing existing calls
-- this.

create or replace function public.decline_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email   text;
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'decline_invite requires an authenticated session'
      using errcode = '28000';
  end if;

  -- The caller's own address, read here rather than accepted as an argument.
  -- This is the whole of the authorisation.
  select p.email into v_email
    from public.profiles p
   where p.id = auth.uid();

  if v_email is null then
    return false;
  end if;

  delete from public.board_invites bi
   where bi.token = p_token
     and bi.accepted_at is null
     and bi.expires_at > now()
     and lower(bi.email) = lower(v_email);

  get diagnostics v_deleted = row_count;

  -- False for unknown, foreign, accepted and expired alike. The UI needs only
  -- "is this still actionable", and distinguishing the four would leak which
  -- invitations exist.
  return v_deleted > 0;
end;
$$;

revoke all on function public.decline_invite(text) from public, anon;
grant execute on function public.decline_invite(text) to authenticated;
grant execute on function public.decline_invite(text) to service_role;

comment on function public.decline_invite(text) is
  'Lets the addressed user refuse a pending invitation. Deletes the row and '
  'returns whether anything was deleted; false for unknown, foreign, accepted '
  'and expired alike. The address is read from the caller, never passed in.';


-- Rollback ---------------------------------------------------------------------
--
-- Forward-only, per Rule 2. To reverse, put the following in a NEW migration:
--
--   drop function if exists public.decline_invite(text);
--
-- Free to reverse at any time: it holds no state, and the notifications panel
-- degrades to Accept-only if the function is absent.
--
--
-- Verification -------------------------------------------------------------------
--
-- As the invited user, with a token from my_pending_invites():
--
--   select public.decline_invite('<their token>');   -- expect: true
--   select public.decline_invite('<same token>');    -- expect: false (gone)
--   select count(*) from public.board_invites where token = '<token>';
--   -- expect: 0
--
-- As a DIFFERENT signed-in user, with somebody else's valid token:
--
--   select public.decline_invite('<not yours>');     -- expect: false
--   -- and the row must still exist:
--   select count(*) from public.board_invites where token = '<not yours>';
--   -- expect: 1
--
-- Signed out:
--
--   select public.decline_invite('anything');        -- expect: 28000

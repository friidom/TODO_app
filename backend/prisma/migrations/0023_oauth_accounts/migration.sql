-- 0023 — provider identities for "Continue with Google" / "Continue with GitHub".
-- EXPAND only: one column loosened, two tables added, nothing dropped and
-- nothing backfilled. Every existing row is already correct — a password
-- account keeps its hash and simply has no identities.
--
-- WHY A TABLE AND NOT COLUMNS ON users. google_id / github_id would be one
-- migration per provider, and "is this identity already claimed" would be one
-- query per column. A row per identity makes that one index probe, forever,
-- and makes "this person has two Google accounts" ordinary data rather than a
-- schema problem.
--
-- WHY IT SITS BESIDE users AND NOT profiles. 0011 settled this for org_role
-- and the argument is unchanged: profiles is the PUBLIC record, readable by
-- every board member, and roster() is one widened select away from leaking
-- whatever is added to it. A provider identity is a credential. Credentials
-- live with password_hash and email_verified_at.
--
-- WHY THERE ARE NO TOKEN COLUMNS. We never call a provider API after login:
-- Google's ID token carries every claim we use, and GitHub's two userinfo
-- calls happen once, inside the callback, and are then discarded. Storing a
-- live third-party token would make a breach of THIS database a breach of the
-- user's Google and GitHub accounts as well. The tokens are deliberately
-- thrown away; there is nowhere here to put them.
--
-- WHY password_hash BECOMES NULLABLE. An OAuth-only account has no password.
-- NULL now means exactly one thing — "no password; authenticates through a
-- linked provider" — and that predicate is what the unlink guard reads to
-- refuse removing somebody's last way in.

alter table users alter column password_hash drop not null;

comment on column users.password_hash is
  'NULL means the account has no password and authenticates through a linked '
  'provider (oauth_accounts). auth.service.ts#login MUST still run '
  'verifyDummyPassword on the NULL branch: skipping the argon2 verify there '
  'makes response time reveal which addresses are OAuth-only, which is the '
  'same enumeration leak the dummy hash exists to close.';

create table oauth_accounts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references users (id) on delete cascade,
  provider                text not null,
  provider_account_id     text not null,
  provider_email          citext,
  provider_email_verified boolean not null default false,
  created_at              timestamptz not null default now(),
  last_login_at           timestamptz,

  constraint oauth_accounts_provider_check
    check (provider in ('google', 'github')),

  constraint oauth_accounts_provider_account_key
    unique (provider, provider_account_id)
);

create index oauth_accounts_user_id_idx on oauth_accounts (user_id);

comment on table oauth_accounts is
  'One row per external identity. A user may hold several, including two from '
  'the same provider — a work Google account and a personal one is ordinary, '
  'so there is deliberately no unique on (user_id, provider).';

comment on column oauth_accounts.provider_account_id is
  'The provider''s own immutable subject id: Google''s `sub`, GitHub''s numeric '
  '`id`. NEVER GitHub''s `login` — logins are renameable and, once released, '
  'claimable by somebody else, so keying on one is a takeover path with a '
  'waiting period. text rather than bigint because Google''s sub is a numeric '
  'STRING of up to 255 characters.';

comment on constraint oauth_accounts_provider_account_key on oauth_accounts is
  'One provider identity belongs to at most one user. This is both the login '
  'lookup key and the anti-hijack guard: without it a race between two first '
  'logins, or a bug in the linking path, attaches one Google sub to two users, '
  'and from then on sign-in returns whichever row the planner happens to order '
  'first. That is non-deterministic authentication, and it would never '
  'reproduce in a test.';

comment on column oauth_accounts.provider_email is
  'What the provider said at link time. DISPLAY AND AUDIT ONLY — never a lookup '
  'key, and deliberately not unique. Two providers legitimately return the same '
  'address for the same person, and matching on it is precisely how OAuth '
  'account takeover happens. Identity is (provider, provider_account_id).';

comment on column oauth_accounts.provider_email_verified is
  'Whether the provider asserted the address was verified AT LINK TIME. An '
  'unverified address never reaches this table today (the callback refuses '
  'first), so this is a record of the assertion rather than a gate.';

-- The Case-4 challenge. A provider identity whose verified email matches an
-- existing account is NOT signed in and NOT linked: it is parked here while the
-- person proves they own that account by signing into it the ordinary way.
--
-- Same shape as password_reset_tokens on purpose — sha256 in the column and
-- never the token, single use via used_at, short expiry. THIS TOKEN IS NOT A
-- CREDENTIAL: it authorises attaching an identity to one named account, and
-- confirming it requires a separately authenticated session whose user id
-- equals user_id below. Without that equality check it would degrade into
-- "link this identity to whoever is signed in", which is a phishable account
-- takeover.
create table oauth_link_tokens (
  id                  uuid primary key default gen_random_uuid(),
  token_hash          text not null unique,
  user_id             uuid not null references users (id) on delete cascade,
  provider            text not null,
  provider_account_id text not null,
  provider_email      citext,
  expires_at          timestamptz not null,
  used_at             timestamptz,
  created_at          timestamptz not null default now(),

  constraint oauth_link_tokens_provider_check
    check (provider in ('google', 'github'))
);

create index oauth_link_tokens_user_id_idx on oauth_link_tokens (user_id);

comment on column oauth_link_tokens.token_hash is
  'sha256 of the opaque token. Never the token itself — the same rule '
  'sessions.token_hash and password_reset_tokens.token_hash follow.';

comment on column oauth_link_tokens.user_id is
  'The EXISTING account the identity would attach to. POST /auth/oauth/link/'
  'confirm refuses unless the authenticated caller IS this user.';

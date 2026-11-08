-- Registration with AUTH_REQUIRE_EMAIL_VERIFICATION=true created the account
-- unverified and nothing ever sent the link that verifies it, so login refused
-- every new account. Same shape as password_reset_tokens: only the sha256 of the
-- token is stored, and a token is spent once.
create table email_verification_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index email_verification_tokens_user_id_idx on email_verification_tokens (user_id);

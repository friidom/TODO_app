import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";
import type { OAuthProvider } from "../../lib/oauth/identity.js";

export interface IdentityOwner {
  id: string;
  user_id: string;
  deactivated_at: Date | null;
}

// The whole of a successful sign-in: one probe on
// oauth_accounts_provider_account_key.
export async function findIdentity(
  provider: OAuthProvider,
  providerAccountId: string,
): Promise<IdentityOwner | null> {
  const row = await prisma.oauth_accounts.findUnique({
    where: { provider_provider_account_id: { provider, provider_account_id: providerAccountId } },
    select: { id: true, user_id: true, users: { select: { deactivated_at: true } } },
  });

  return row === null
    ? null
    : { id: row.id, user_id: row.user_id, deactivated_at: row.users.deactivated_at };
}

export interface EmailOwner {
  id: string;
  deactivated_at: Date | null;
}

// users.email is citext, so the unique index folds case without help here.
export function findUserByEmail(email: string): Promise<EmailOwner | null> {
  return prisma.users.findUnique({
    where: { email },
    select: { id: true, deactivated_at: true },
  });
}

export function insertIdentity(
  tx: Prisma.TransactionClient,
  identity: {
    userId: string;
    provider: OAuthProvider;
    providerAccountId: string;
    providerEmail: string | null;
    providerEmailVerified: boolean;
    lastLoginAt: Date | null;
  },
): Promise<{ id: string }> {
  return tx.oauth_accounts.create({
    data: {
      user_id: identity.userId,
      provider: identity.provider,
      provider_account_id: identity.providerAccountId,
      provider_email: identity.providerEmail,
      provider_email_verified: identity.providerEmailVerified,
      last_login_at: identity.lastLoginAt,
    },
    select: { id: true },
  });
}

// Display fields only. The address the provider reports can change between
// logins, and the settings screen should show what is true now.
export function touchIdentity(
  id: string,
  patch: { providerEmail: string | null; providerEmailVerified: boolean; lastLoginAt: Date },
): Promise<{ id: string }> {
  return prisma.oauth_accounts.update({
    where: { id },
    data: {
      provider_email: patch.providerEmail,
      provider_email_verified: patch.providerEmailVerified,
      last_login_at: patch.lastLoginAt,
    },
    select: { id: true },
  });
}

const CONNECTION_FIELDS = {
  id: true,
  provider: true,
  provider_email: true,
  created_at: true,
  last_login_at: true,
} satisfies Prisma.oauth_accountsSelect;

export type ConnectionRow = Prisma.oauth_accountsGetPayload<{ select: typeof CONNECTION_FIELDS }>;

export function listConnections(userId: string): Promise<ConnectionRow[]> {
  return prisma.oauth_accounts.findMany({
    where: { user_id: userId },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: CONNECTION_FIELDS,
  });
}

// Scoped by (id, user_id) rather than id alone, for the reason CONVENTIONS.md
// gives for board scoping: a pasted id from another account must find nothing,
// not somebody else's row.
export async function deleteConnection(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const { count } = await tx.oauth_accounts.deleteMany({ where: { id, user_id: userId } });

  return count === 1;
}

// Serialises unlinks for one account. A transaction alone is NOT enough:
// PostgreSQL's default READ COMMITTED lets two concurrent unlinks of the last
// two methods both read "two remain" and both delete, leaving an account
// nobody can sign into. Taking the user row first makes the second wait for
// the first to commit, so it sees the true count. Asserted by
// oauth.int.test.ts rather than inferred.
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`select id from users where id = ${userId}::uuid for update`;
}

// Both halves of "would this leave them locked out", read inside the
// transaction that lockUser has already serialised.
export async function loginMethodsOf(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ hasPassword: boolean; connections: number }> {
  const [user, connections] = await Promise.all([
    tx.users.findUnique({ where: { id: userId }, select: { password_hash: true } }),
    tx.oauth_accounts.count({ where: { user_id: userId } }),
  ]);

  return { hasPassword: user !== null && user.password_hash !== null, connections };
}

export function createLinkToken(
  token: {
    tokenHash: string;
    userId: string;
    provider: OAuthProvider;
    providerAccountId: string;
    providerEmail: string | null;
    expiresAt: Date;
  },
): Promise<{ id: string }> {
  return prisma.oauth_link_tokens.create({
    data: {
      token_hash: token.tokenHash,
      user_id: token.userId,
      provider: token.provider,
      provider_account_id: token.providerAccountId,
      provider_email: token.providerEmail,
      expires_at: token.expiresAt,
    },
    select: { id: true },
  });
}

export function findLinkToken(tx: Prisma.TransactionClient, tokenHash: string) {
  return tx.oauth_link_tokens.findUnique({
    where: { token_hash: tokenHash },
    select: {
      id: true,
      user_id: true,
      provider: true,
      provider_account_id: true,
      provider_email: true,
      expires_at: true,
      used_at: true,
    },
  });
}

// The count tells two concurrent confirmations apart: the one that updates
// nothing already lost. Same guard as consumeResetToken.
export async function consumeLinkToken(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<boolean> {
  const { count } = await tx.oauth_link_tokens.updateMany({
    where: { id, used_at: null },
    data: { used_at: new Date() },
  });

  return count === 1;
}

// A second challenge for the same identity supersedes the first, so an
// abandoned attempt cannot be replayed later.
export function invalidateLinkTokens(
  provider: OAuthProvider,
  providerAccountId: string,
): Promise<{ count: number }> {
  return prisma.oauth_link_tokens.updateMany({
    where: { provider, provider_account_id: providerAccountId, used_at: null },
    data: { used_at: new Date() },
  });
}

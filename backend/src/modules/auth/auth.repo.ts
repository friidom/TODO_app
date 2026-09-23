import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

export interface CredentialRow {
  id: string;
  email: string;
  // Null since 0023: an OAuth-only account has no password. login() must keep
  // hashing on that branch — see the column comment.
  password_hash: string | null;
  email_verified_at: Date | null;
  deactivated_at: Date | null;
}

const CREDENTIAL_FIELDS = {
  id: true,
  email: true,
  password_hash: true,
  email_verified_at: true,
  deactivated_at: true,
} as const;

// users.email is citext, so the unique index folds case — no lower() needed.
export function findUserByEmail(email: string): Promise<CredentialRow | null> {
  return prisma.users.findUnique({ where: { email }, select: CREDENTIAL_FIELDS });
}

// Raw because profiles_username_lower_key indexes lower(username): a Prisma
// `equals` or `mode: "insensitive"` can't use that index. $1 is a bind
// parameter, not string interpolation.
export async function findUserByUsername(username: string): Promise<CredentialRow | null> {
  const rows = await prisma.$queryRaw<CredentialRow[]>`
    select u.id, u.email, u.password_hash, u.email_verified_at, u.deactivated_at
      from profiles p
      join users u on u.id = p.id
     where lower(p.username) = ${username}
     limit 1`;

  return rows[0] ?? null;
}

export function insertUser(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string; passwordHash: string | null; emailVerifiedAt: Date | null },
): Promise<{ id: string; email: string; email_verified_at: Date | null; created_at: Date }> {
  return tx.users.create({
    data: {
      id: user.id,
      email: user.email,
      password_hash: user.passwordHash,
      email_verified_at: user.emailVerifiedAt,
    },
    select: { id: true, email: true, email_verified_at: true, created_at: true },
  });
}

export function findUserById(userId: string) {
  return prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      email_verified_at: true,
      created_at: true,
      deactivated_at: true,
      org_role: true,
      profiles: {
        select: { id: true, username: true, full_name: true, bio: true, avatar_url: true },
      },
    },
  });
}

export function createSession(
  tx: Prisma.TransactionClient,
  session: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
    userAgent?: string | null;
    ip?: string | null;
  },
): Promise<{ id: string; family_id: string }> {
  return tx.sessions.create({
    data: {
      user_id: session.userId,
      token_hash: session.tokenHash,
      family_id: session.familyId,
      expires_at: session.expiresAt,
      user_agent: session.userAgent ?? null,
      ip: session.ip ?? null,
    },
    select: { id: true, family_id: true },
  });
}

export function findSessionByHash(tx: Prisma.TransactionClient, tokenHash: string) {
  return tx.sessions.findUnique({
    where: { token_hash: tokenHash },
    select: {
      id: true,
      user_id: true,
      family_id: true,
      expires_at: true,
      revoked_at: true,
      users: { select: { deactivated_at: true } },
    },
  });
}

// The count tells apart two parallel refreshes racing on the same token: the
// one that updates nothing already lost to the other.
export async function revokeSessionIfLive(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<boolean> {
  const { count } = await tx.sessions.updateMany({
    where: { id: sessionId, revoked_at: null },
    data: { revoked_at: new Date() },
  });

  return count === 1;
}

export function revokeFamily(
  tx: Prisma.TransactionClient,
  familyId: string,
): Promise<{ count: number }> {
  return tx.sessions.updateMany({
    where: { family_id: familyId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export function revokeAllSessions(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ count: number }> {
  return tx.sessions.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export function createResetToken(
  tx: Prisma.TransactionClient,
  token: { userId: string; tokenHash: string; expiresAt: Date },
): Promise<{ id: string }> {
  return tx.password_reset_tokens.create({
    data: { user_id: token.userId, token_hash: token.tokenHash, expires_at: token.expiresAt },
    select: { id: true },
  });
}

export function findResetToken(tx: Prisma.TransactionClient, tokenHash: string) {
  return tx.password_reset_tokens.findUnique({
    where: { token_hash: tokenHash },
    select: { id: true, user_id: true, expires_at: true, used_at: true },
  });
}

// Same race guard as revokeSessionIfLive.
export async function consumeResetToken(
  tx: Prisma.TransactionClient,
  tokenId: string,
): Promise<boolean> {
  const { count } = await tx.password_reset_tokens.updateMany({
    where: { id: tokenId, used_at: null },
    data: { used_at: new Date() },
  });

  return count === 1;
}

export function invalidateResetTokens(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ count: number }> {
  return tx.password_reset_tokens.updateMany({
    where: { user_id: userId, used_at: null },
    data: { used_at: new Date() },
  });
}

export function updatePasswordHash(
  tx: Prisma.TransactionClient,
  userId: string,
  passwordHash: string,
): Promise<{ id: string }> {
  return tx.users.update({
    where: { id: userId },
    data: { password_hash: passwordHash, updated_at: new Date() },
    select: { id: true },
  });
}

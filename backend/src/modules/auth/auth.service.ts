import { randomUUID } from "node:crypto";

import { PASSWORD_RESET_TTL_MINUTES } from "../../config/constants.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { withActor } from "../../db/withActor.js";
import { AppError, uniqueConstraintOf } from "../../lib/errors.js";
import { normalizeIdentifier } from "../../lib/identifier.js";
import { mailer } from "../../lib/mail.js";
import { hashPassword, verifyDummyPassword, verifyPassword } from "../../lib/password.js";
import { mintOpaqueToken, refreshTokenExpiry, sha256, signAccessToken } from "../../lib/tokens.js";
import { isValidUsername, normalizeUsername } from "../../lib/username.js";
import * as usersRepo from "../users/users.repo.js";
import { provisionUser } from "../users/users.service.js";
import * as authRepo from "./auth.repo.js";
import type { LoginInput, RegisterInput, ResetPasswordInput } from "./auth.schema.js";

export interface RequestMeta {
  userAgent: string | null;
  ip: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  email_verified_at: Date | null;
  created_at: Date;
  profile: {
    id: string;
    username: string;
    full_name: string | null;
    bio: string | null;
    avatar_url: string | null;
  } | null;
}

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export type AuthResult =
  | ({ user: PublicUser; needsVerification: false } & IssuedSession)
  | { user: PublicUser; needsVerification: true };

// One message for every way login can fail, so the response can't be used to
// tell which accounts exist.
function invalidCredentials(): AppError {
  return new AppError("unauthorized", "Invalid login credentials");
}

function sessionRejected(): AppError {
  return new AppError("unauthorized", "Session expired. Please sign in again.");
}

async function issueSession(userId: string, meta: RequestMeta): Promise<IssuedSession> {
  const { token, tokenHash } = mintOpaqueToken();

  // No withActor: nothing on sessions reads app.actor_id.
  await authRepo.createSession(prisma, {
    userId,
    tokenHash,
    familyId: randomUUID(),
    expiresAt: refreshTokenExpiry(),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  return { ...signAccessToken(userId), refreshToken: token };
}

type UserRow = NonNullable<Awaited<ReturnType<typeof authRepo.findUserById>>>;

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    email_verified_at: row.email_verified_at,
    created_at: row.created_at,
    profile: row.profiles,
  };
}

async function publicUserOf(userId: string): Promise<PublicUser> {
  const row = await authRepo.findUserById(userId);

  if (row === null || row.deactivated_at !== null) throw invalidCredentials();

  return toPublicUser(row);
}

// A taken email is reported directly — registration is already an
// email-existence oracle by nature. A taken username means the suffix loop
// below lost a race and should be retried, not reported.
function registrationConflict(error: unknown): unknown {
  switch (uniqueConstraintOf(error)) {
    case "users_email_key":
      return new AppError("conflict", "An account with that email already exists.");
    case "profiles_username_lower_key":
      return new AppError("conflict", "That username was just taken. Please try another.");
    default:
      return error;
  }
}

export async function register(input: RegisterInput, meta: RequestMeta): Promise<AuthResult> {
  const userId = randomUUID();

  // Hashed before the transaction opens — argon2 is ~100ms of CPU that
  // shouldn't hold a database transaction open.
  const passwordHash = await hashPassword(input.password);

  try {
    // The account and everything provisioned from it commit together, so a
    // failure partway never leaves an account with no board. withActor (not a
    // bare transaction) because creating the board fires add_owner_membership,
    // which fires log_member_activity, which reads app.actor_id.
    await withActor(userId, async (tx) => {
      await authRepo.insertUser(tx, {
        id: userId,
        email: input.email,
        passwordHash,
        emailVerifiedAt: env.AUTH_REQUIRE_EMAIL_VERIFICATION ? null : new Date(),
      });

      await provisionUser(tx, { id: userId, email: input.email, username: input.username });
    });
  } catch (error) {
    throw registrationConflict(error);
  }

  const user = await publicUserOf(userId);

  if (env.AUTH_REQUIRE_EMAIL_VERIFICATION) {
    return { user, needsVerification: true };
  }

  return { user, needsVerification: false, ...(await issueSession(userId, meta)) };
}

export async function login(input: LoginInput, meta: RequestMeta): Promise<AuthResult> {
  const { kind, value } = normalizeIdentifier(input.identifier);

  const found =
    kind === "email"
      ? await authRepo.findUserByEmail(value)
      : await authRepo.findUserByUsername(value);

  // Dummy verify keeps both branches the same cost — without it, "no such
  // user" returns in a millisecond and "wrong password" in a hundred.
  const correct =
    found === null
      ? await verifyDummyPassword(input.password)
      : await verifyPassword(found.password_hash, input.password);

  if (found === null || !correct) throw invalidCredentials();

  // After the hash, so this costs the same time as an active account.
  if (found.deactivated_at !== null) throw invalidCredentials();

  if (env.AUTH_REQUIRE_EMAIL_VERIFICATION && found.email_verified_at === null) {
    throw invalidCredentials();
  }

  const user = await publicUserOf(found.id);

  return { user, needsVerification: false, ...(await issueSession(found.id, meta)) };
}

type RotationOutcome = { ok: true; userId: string; refreshToken: string } | { ok: false };

export interface RefreshResult {
  user: PublicUser;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export async function refresh(
  presented: string | undefined,
  meta: RequestMeta,
): Promise<RefreshResult> {
  if (presented === undefined || presented === "") throw sessionRejected();

  const tokenHash = sha256(presented);

  // The transaction returns a verdict instead of throwing one. A throw would
  // roll back the family revocation performed inside it, which is the one
  // write that has to survive a rejected refresh.
  const outcome: RotationOutcome = await prisma.$transaction(async (tx) => {
    const session = await authRepo.findSessionByHash(tx, tokenHash);

    if (session === null) return { ok: false };

    // An already-rotated token means it leaked. Revoke the whole lineage.
    if (session.revoked_at !== null) {
      await authRepo.revokeFamily(tx, session.family_id);

      return { ok: false };
    }

    if (session.users.deactivated_at !== null || session.expires_at <= new Date()) {
      await authRepo.revokeFamily(tx, session.family_id);

      return { ok: false };
    }

    // Losing this race is indistinguishable from reuse — treated as such.
    if (!(await authRepo.revokeSessionIfLive(tx, session.id))) {
      await authRepo.revokeFamily(tx, session.family_id);

      return { ok: false };
    }

    const next = mintOpaqueToken();

    await authRepo.createSession(tx, {
      userId: session.user_id,
      tokenHash: next.tokenHash,
      // Same lineage: rotation extends the family, it does not start one.
      familyId: session.family_id,
      expiresAt: refreshTokenExpiry(),
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    return { ok: true, userId: session.user_id, refreshToken: next.token };
  });

  if (!outcome.ok) throw sessionRejected();

  const user = await publicUserOf(outcome.userId);

  return { user, refreshToken: outcome.refreshToken, ...signAccessToken(outcome.userId) };
}

// Never fails: an unknown or already-revoked token still clears the cookie.
export async function logout(presented: string | undefined, all: boolean): Promise<void> {
  if (presented === undefined || presented === "") return;

  await prisma.$transaction(async (tx) => {
    const session = await authRepo.findSessionByHash(tx, sha256(presented));

    if (session === null) return;

    // A revoked or expired token proves nothing — refresh already treats one
    // as evidence of theft. Acting on it here would let a long-dead token log
    // someone out of every other device, indefinitely.
    if (session.revoked_at !== null || session.expires_at <= new Date()) return;

    if (all) {
      await authRepo.revokeAllSessions(tx, session.user_id);
    } else {
      await authRepo.revokeSessionIfLive(tx, session.id);
    }
  });
}

// Deliberately not publicUserOf().catch(): a blanket catch turns a database
// outage into "you are not signed in", and the client signs everyone out.
export async function me(userId: string): Promise<PublicUser> {
  const row = await authRepo.findUserById(userId);

  if (row === null || row.deactivated_at !== null) {
    throw new AppError("unauthorized", "Not authenticated.");
  }

  return toPublicUser(row);
}

// Always resolves the same way, whether or not the address exists.
export async function forgotPassword(email: string): Promise<void> {
  const user = await authRepo.findUserByEmail(email.trim());

  if (user === null || user.deactivated_at !== null) return;

  const { token, tokenHash } = mintOpaqueToken();

  await authRepo.createResetToken(prisma, {
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
  });

  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await mailer.send({
      to: user.email,
      subject: "Reset your password",
      text:
        `Open this link to choose a new password:\n\n${link}\n\n` +
        `It expires in ${PASSWORD_RESET_TTL_MINUTES} minutes and can be used once. ` +
        `If you did not ask for it, nothing has changed and you can ignore this message.`,
    });
  } catch (error) {
    // Must not surface as a 500 — that would answer differently for a real address.
    console.error("[auth] password reset mail failed:", error);
  }
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const tokenHash = sha256(input.token);
  const passwordHash = await hashPassword(input.password);

  const ok = await prisma.$transaction(async (tx) => {
    const token = await authRepo.findResetToken(tx, tokenHash);

    if (token === null || token.used_at !== null || token.expires_at <= new Date()) return false;

    if (!(await authRepo.consumeResetToken(tx, token.id))) return false;

    await authRepo.updatePasswordHash(tx, token.user_id, passwordHash);
    await authRepo.invalidateResetTokens(tx, token.user_id);

    await authRepo.revokeAllSessions(tx, token.user_id);

    return true;
  });

  if (!ok) throw new AppError("bad_request", "This reset link is invalid or has expired.");
}

// Advisory only — the unique index is the real guarantee.
export function usernameAvailable(raw: string): Promise<boolean> {
  const username = normalizeUsername(raw);

  if (!isValidUsername(username)) return Promise.resolve(false);

  return usersRepo.usernameExists(prisma, username).then((taken) => !taken);
}

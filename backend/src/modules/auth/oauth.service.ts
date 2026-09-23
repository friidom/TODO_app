import { randomUUID } from "node:crypto";

import { OAUTH_LINK_TTL_MINUTES } from "../../config/constants.js";
import { prisma } from "../../db/prisma.js";
import { withActor } from "../../db/withActor.js";
import { AppError, uniqueConstraintOf } from "../../lib/errors.js";
import type { OAuthProvider, ProviderIdentity } from "../../lib/oauth/identity.js";
import { mintOpaqueToken, sha256 } from "../../lib/tokens.js";
import { provisionUser } from "../users/users.service.js";
import * as authRepo from "./auth.repo.js";
import { issueSession, type IssuedSession, type RequestMeta } from "./auth.service.js";
import * as oauthRepo from "./oauth.repo.js";

export type RefuseReason = "email_unverified" | "email_missing" | "account_disabled";

export type Outcome =
  | { kind: "sign_in"; userId: string; identityId: string }
  // Carries the address rather than making the caller re-derive it: the policy
  // has already proved it is non-null and verified, and a cast at the create
  // site would silently survive any reordering of the checks below.
  | { kind: "create_user"; email: string }
  | { kind: "needs_link"; userId: string }
  | { kind: "refuse"; reason: RefuseReason };

export interface IdentityLookups {
  byProvider: { id: string; userId: string; deactivated: boolean } | null;
  byEmail: { userId: string; deactivated: boolean } | null;
}

// THE POLICY. Pure and I/O-free on purpose, so oauth.service.test.ts can pin
// every rule with no database and no provider — the same shape lib/permissions
// and lib/workflow use for the rules that matter most.
//
// The single invariant underneath all of it: (provider, providerAccountId) is
// the only thing that authenticates. An email address is a HINT that triggers a
// challenge, never a match that grants access.
export function resolveIdentity(
  identity: ProviderIdentity,
  found: IdentityLookups,
): Outcome {
  // R1. A known identity signs in, and the email is irrelevant here — it may
  // have changed at the provider, or stopped being verified, since the link was
  // made. Checked FIRST, before any email rule, precisely so that a provider
  // changing what it reports can never lock somebody out of their own account.
  if (found.byProvider !== null) {
    if (found.byProvider.deactivated) return { kind: "refuse", reason: "account_disabled" };

    return { kind: "sign_in", userId: found.byProvider.userId, identityId: found.byProvider.id };
  }

  // R2. An unknown identity with nothing the provider will vouch for cannot
  // become an account: users.email is NOT NULL and is what invites resolve
  // against, and an unverified address must never be matched or claimed.
  if (identity.email === null) {
    return { kind: "refuse", reason: identity.emailVerified ? "email_missing" : "email_unverified" };
  }

  if (!identity.emailVerified) return { kind: "refuse", reason: "email_unverified" };

  // R3. Nobody holds this address: this is a genuinely new person.
  if (found.byEmail === null) return { kind: "create_user", email: identity.email };

  if (found.byEmail.deactivated) return { kind: "refuse", reason: "account_disabled" };

  // R4. Somebody already holds this address. NOT a sign-in and NOT a merge:
  // auto-linking here is the documented account-takeover path, because the
  // existing account may have been pre-registered by an attacker who simply
  // typed the victim's address. Prove ownership first.
  return { kind: "needs_link", userId: found.byEmail.userId };
}

async function lookups(identity: ProviderIdentity): Promise<IdentityLookups> {
  const byProvider = await oauthRepo.findIdentity(identity.provider, identity.providerAccountId);

  const byEmail =
    identity.email === null || !identity.emailVerified
      ? null
      : await oauthRepo.findUserByEmail(identity.email);

  return {
    byProvider:
      byProvider === null
        ? null
        : {
            id: byProvider.id,
            userId: byProvider.user_id,
            deactivated: byProvider.deactivated_at !== null,
          },
    byEmail:
      byEmail === null
        ? null
        : { userId: byEmail.id, deactivated: byEmail.deactivated_at !== null },
  };
}

function usernameSeedOf(identity: ProviderIdentity): string {
  return (
    identity.usernameHint ??
    identity.name ??
    identity.email?.split("@")[0] ??
    identity.provider
  );
}

// Account, profile, space, board, columns and the identity all commit together,
// so a failure partway can never leave an account with no board or a user with
// no way back in. withActor rather than a bare transaction because creating the
// board fires add_owner_membership -> log_member_activity, which reads
// app.actor_id.
async function createUserForIdentity(
  identity: ProviderIdentity,
  email: string,
): Promise<string> {
  const userId = randomUUID();

  await withActor(userId, async (tx) => {
    await authRepo.insertUser(tx, {
      id: userId,
      email,
      // No password. The account authenticates through the identity below, and
      // /password/forgot remains available to add one later.
      passwordHash: null,
      // The provider verified the address, which is strictly stronger evidence
      // than the confirmation mail this app cannot yet send.
      emailVerifiedAt: new Date(),
    });

    await provisionUser(tx, { id: userId, email, username: usernameSeedOf(identity) });

    await oauthRepo.insertIdentity(tx, {
      userId,
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
      providerEmail: identity.email,
      providerEmailVerified: identity.emailVerified,
      lastLoginAt: new Date(),
    });
  });

  return userId;
}

async function mintLinkChallenge(identity: ProviderIdentity, userId: string): Promise<string> {
  // An abandoned earlier challenge for this same identity is retired, so only
  // the newest one can ever be spent.
  await oauthRepo.invalidateLinkTokens(identity.provider, identity.providerAccountId);

  const { token, tokenHash } = mintOpaqueToken();

  await oauthRepo.createLinkToken({
    tokenHash,
    userId,
    provider: identity.provider,
    providerAccountId: identity.providerAccountId,
    providerEmail: identity.email,
    expiresAt: new Date(Date.now() + OAUTH_LINK_TTL_MINUTES * 60_000),
  });

  return token;
}

export type CallbackResult =
  | { kind: "session"; session: IssuedSession }
  | { kind: "link_challenge"; token: string }
  | { kind: "refuse"; reason: RefuseReason };

// Two attempts, because both create paths can lose a race to a concurrent
// first login: the email unique violation means somebody just took the address
// (so the retry resolves to a link challenge), and the identity unique
// violation means somebody just linked it (so the retry resolves to a sign-in).
// Re-resolving is what keeps duplicate prevention a property of the database
// rather than of request timing.
const CREATE_ATTEMPTS = 2;

export async function completeSignIn(
  identity: ProviderIdentity,
  meta: RequestMeta,
): Promise<CallbackResult> {
  for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt += 1) {
    const outcome = resolveIdentity(identity, await lookups(identity));

    if (outcome.kind === "refuse") return outcome;

    if (outcome.kind === "needs_link") {
      return { kind: "link_challenge", token: await mintLinkChallenge(identity, outcome.userId) };
    }

    if (outcome.kind === "sign_in") {
      await oauthRepo.touchIdentity(outcome.identityId, {
        providerEmail: identity.email,
        providerEmailVerified: identity.emailVerified,
        lastLoginAt: new Date(),
      });

      return { kind: "session", session: await issueSession(outcome.userId, meta) };
    }

    try {
      const userId = await createUserForIdentity(identity, outcome.email);

      return { kind: "session", session: await issueSession(userId, meta) };
    } catch (error) {
      const constraint = uniqueConstraintOf(error);

      const raced =
        constraint === "users_email_key" ||
        constraint === "oauth_accounts_provider_account_key";

      if (!raced || attempt === CREATE_ATTEMPTS) throw error;
    }
  }

  throw new AppError("internal", "Internal server error");
}

function alreadyLinkedElsewhere(): AppError {
  return new AppError(
    "conflict",
    "That account is already connected to a different user. Disconnect it there first.",
  );
}

// R5/R6/R7. `actorId` comes from a verified access token and from nowhere else;
// the provider's email plays no part at all, because the person is already
// authenticated as the account being linked to.
export async function linkIdentity(
  actorId: string,
  identity: ProviderIdentity,
): Promise<{ linked: boolean }> {
  const existing = await oauthRepo.findIdentity(identity.provider, identity.providerAccountId);

  // R6: idempotent. Clicking Connect twice is not an error.
  if (existing !== null && existing.user_id === actorId) return { linked: false };

  // R5: never move an identity between accounts. Two accounts that are really
  // one person are reconciled by the human unlinking there and linking here —
  // each half separately authenticated — never by a silent merge.
  if (existing !== null) throw alreadyLinkedElsewhere();

  try {
    await prisma.$transaction((tx) =>
      oauthRepo.insertIdentity(tx, {
        userId: actorId,
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        providerEmail: identity.email,
        providerEmailVerified: identity.emailVerified,
        lastLoginAt: new Date(),
      }),
    );
  } catch (error) {
    if (uniqueConstraintOf(error) === "oauth_accounts_provider_account_key") {
      throw alreadyLinkedElsewhere();
    }

    throw error;
  }

  return { linked: true };
}

function challengeRejected(): AppError {
  return new AppError("bad_request", "This link request is invalid or has expired.");
}

// The Case-4 completion, and the single most important check in the feature.
// The token names the account to attach to; the ACCESS TOKEN names who is
// asking. They must be the same person, or this endpoint degrades into "link
// this identity to whoever is signed in" — and an attacker phishes a victim
// into clicking a link that attaches the ATTACKER's provider identity to the
// VICTIM's account, after which the attacker simply signs in with it.
export async function confirmLink(actorId: string, presented: string): Promise<void> {
  const tokenHash = sha256(presented);

  const identity = await prisma.$transaction(async (tx) => {
    const token = await oauthRepo.findLinkToken(tx, tokenHash);

    if (token === null || token.used_at !== null || token.expires_at <= new Date()) {
      throw challengeRejected();
    }

    if (token.user_id !== actorId) {
      throw new AppError("forbidden", "This link request belongs to a different account.");
    }

    if (!(await oauthRepo.consumeLinkToken(tx, token.id))) throw challengeRejected();

    return {
      provider: token.provider as OAuthProvider,
      providerAccountId: token.provider_account_id,
      providerEmail: token.provider_email,
    };
  });

  // R6, the same probe linkIdentity makes: without it, confirming a challenge
  // for an identity the caller has meanwhile linked by another route hits the
  // unique constraint and reports "connected to a DIFFERENT user" — which is
  // the one thing it is not.
  const existing = await oauthRepo.findIdentity(identity.provider, identity.providerAccountId);

  if (existing !== null) {
    if (existing.user_id === actorId) return;

    throw alreadyLinkedElsewhere();
  }

  try {
    await prisma.$transaction((tx) =>
      oauthRepo.insertIdentity(tx, {
        userId: actorId,
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        providerEmail: identity.providerEmail,
        // It only became a challenge by being verified in the first place.
        providerEmailVerified: true,
        lastLoginAt: new Date(),
      }),
    );
  } catch (error) {
    if (uniqueConstraintOf(error) === "oauth_accounts_provider_account_key") {
      throw alreadyLinkedElsewhere();
    }

    throw error;
  }
}

export interface PublicConnection {
  id: string;
  provider: string;
  email: string | null;
  created_at: Date;
  last_login_at: Date | null;
}

export interface ConnectionsView {
  connections: PublicConnection[];
  // So the settings screen can disable the last Disconnect with an explanation
  // rather than letting the person discover the 409 by clicking it. The server
  // guard in unlinkConnection is still the real rule.
  hasPassword: boolean;
}

export async function listConnections(userId: string): Promise<ConnectionsView> {
  const [rows, methods] = await Promise.all([
    oauthRepo.listConnections(userId),
    oauthRepo.loginMethodsOf(prisma, userId),
  ]);

  return {
    connections: rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      email: row.provider_email,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    })),
    hasPassword: methods.hasPassword,
  };
}

export async function unlinkConnection(actorId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Before the counts, not after: READ COMMITTED would otherwise let two
    // concurrent unlinks both read a stale "two remain".
    await oauthRepo.lockUser(tx, actorId);

    const { hasPassword, connections } = await oauthRepo.loginMethodsOf(tx, actorId);
    if (!hasPassword && connections <= 1) {
      throw new AppError(
        "conflict",
        "This is the only way into your account. Set a password first, or connect another provider.",
      );
    }

    if (!(await oauthRepo.deleteConnection(tx, actorId, id))) {
      throw new AppError("not_found", "That connection does not exist.");
    }
  });
}

import type { Request, RequestHandler, Response } from "express";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { safeNext } from "../../lib/nextPath.js";
import { OAuthProviderError, type OAuthProvider } from "../../lib/oauth/identity.js";
import { adapterFor, callbackUrl, configuredProviders } from "../../lib/oauth/providers.js";
import { requireActor } from "../../middleware/requireAuth.js";
import { metaOf } from "./auth.controller.js";
import { setRefreshCookie } from "./auth.cookies.js";
import type {
  ConnectionParams,
  LinkConfirmInput,
  LinkStartInput,
  OAuthCallbackQuery,
  OAuthStartQuery,
  ProviderParams,
} from "./oauth.schema.js";
import * as oauthService from "./oauth.service.js";
import {
  clearTransactionCookie,
  mintTransaction,
  readTransaction,
  setTransactionCookie,
  type OAuthMode,
} from "./oauth.state.js";

// Every redirect target is built from APP_URL plus a path this file controls.
// A provider's own error string is never echoed into it — only the fixed
// identifiers below reach the browser.
function frontendUrl(path: string): string {
  return `${env.APP_URL.replace(/\/+$/, "")}${path}`;
}

// Link failures must NOT land on /login. The person is already signed in, and
// /login sits behind PublicRoute, which bounces an authenticated visitor
// straight to "/" — the message would never be read. They came from settings,
// so that is where the answer belongs.
function redirectToError(res: Response, reason: string, mode: OAuthMode = "login"): void {
  clearTransactionCookie(res);

  const page = mode === "link" ? "/profile" : "/login";

  res.redirect(frontendUrl(`${page}?error=${encodeURIComponent(reason)}`));
}

function providerOf(req: Request): OAuthProvider {
  return (req.params as ProviderParams).provider;
}

export const providers: RequestHandler = (_req, res) => {
  res.json({ providers: configuredProviders() });
};

export const start: RequestHandler = (req, res) => {
  const provider = providerOf(req);
  const { next } = req.query as OAuthStartQuery;

  // Screened here before it enters the signed cookie, and again at the
  // callback before it becomes a Location header.
  const authorizeUrl = beginAuthorization(res, provider, safeNext(next), "login", null);

  if (authorizeUrl === null) {
    redirectToError(res, "provider_unavailable");

    return;
  }

  res.redirect(authorizeUrl);
};

// Shared by the sign-in and the link entry points, so the two cannot drift in
// how they mint state, PKCE or the nonce.
function beginAuthorization(
  res: Response,
  provider: OAuthProvider,
  next: string | null,
  mode: "login" | "link",
  linkUserId: string | null,
): string | null {
  const adapter = adapterFor(provider);

  if (adapter === undefined) return null;

  const tx = mintTransaction({ provider, next, mode, linkUserId });

  setTransactionCookie(res, tx.token);

  return adapter.authorizeUrl({
    redirectUri: callbackUrl(provider),
    state: tx.state,
    // A provider that does not use these is handed values it will ignore;
    // gating here rather than in the adapter would put the same conditional in
    // every adapter.
    nonce: adapter.usesNonce ? tx.nonce : "",
    codeChallenge: adapter.usesPkce ? tx.codeChallenge : "",
  });
}

export const callback: RequestHandler = async (req, res) => {
  const provider = providerOf(req);
  const query = req.query as OAuthCallbackQuery;

  // Hoisted out of the try: once the transaction is read, every later failure
  // -- including one thrown from the exchange -- has to redirect to the page
  // the person actually came from.
  let mode: OAuthMode = "login";

  try {
    // Read FIRST, before the error and code branches, purely to learn the
    // mode: a provider echoes `state` on a cancellation too, and a cancelled
    // LINK has to be reported on /profile. Resolving it after those branches
    // sent every cancelled link to /login, where the person -- who is signed
    // in -- never sees it.
    const tx =
      query.state === undefined ? null : readTransaction(req, provider, query.state);

    if (tx !== null) mode = tx.mode;

    // The provider says so when the person cancels at the consent screen. Its
    // own error string is deliberately not forwarded.
    if (query.error !== undefined) {
      redirectToError(res, "provider_denied", mode);

      return;
    }

    if (query.code === undefined || query.state === undefined) {
      redirectToError(res, "invalid_request", mode);

      return;
    }

    if (tx === null) {
      // Covers a forged or missing state, an expired attempt, a second tab
      // having overwritten the cookie, and a browser refusing to store it.
      redirectToError(res, "invalid_state");

      return;
    }

    const adapter = adapterFor(provider);

    if (adapter === undefined) {
      redirectToError(res, "provider_unavailable", mode);

      return;
    }

    const identity = await adapter.exchange({
      code: query.code,
      redirectUri: callbackUrl(provider),
      codeVerifier: tx.verifier,
      nonce: tx.nonce,
    });

    // Single use: the attempt is over the moment the code has been spent.
    clearTransactionCookie(res);

    if (tx.mode === "link") {
      if (tx.linkUserId === null) {
        redirectToError(res, "invalid_state", mode);

        return;
      }

      await oauthService.linkIdentity(tx.linkUserId, identity);

      res.redirect(frontendUrl("/profile?linked=1"));

      return;
    }

    const result = await oauthService.completeSignIn(identity, metaOf(req));

    if (result.kind === "refuse") {
      redirectToError(res, result.reason, mode);

      return;
    }

    if (result.kind === "link_challenge") {
      res.redirect(frontendUrl(`/login?link=${encodeURIComponent(result.token)}`));

      return;
    }

    // The ordinary refresh cookie, set by the ordinary helper. No token goes
    // into the URL: the frontend spends this cookie through the same
    // /auth/refresh round trip a page reload already performs.
    setRefreshCookie(res, result.session.refreshToken);

    res.redirect(frontendUrl(safeNext(tx.next) ?? "/"));
  } catch (error) {
    // Nothing may reach errorHandler from here: a JSON error body at the end of
    // a browser navigation is a dead end with no way back to the app.
    //
    // The precise reason is logged and NOT redirected with. "id_token_nonce"
    // versus "id_token_alg" in the address bar tells whoever is probing exactly
    // which check refused them, and none of it is actionable by the person
    // reading it — every one of these means "try again".
    if (error instanceof OAuthProviderError) {
      console.warn(`[oauth] ${provider} rejected: ${error.reason}`);

      redirectToError(res, "provider_failed", mode);

      return;
    }

    // R5: the identity already belongs to somebody else. A real answer, not a
    // crash, so it gets its own code rather than the generic one.
    if (error instanceof AppError && error.code === "conflict") {
      redirectToError(res, "already_linked", mode);

      return;
    }

    console.error(`[oauth] ${provider} callback failed:`, error);

    redirectToError(res, "oauth_failed", mode);
  }
};

// A POST, not a link, because the access token lives in a JS variable and a
// navigation would carry no Authorization header. The account being linked to
// is therefore read from a VERIFIED token here and sealed into the signed
// cookie, never named in a query parameter the browser could influence.
export const linkStart: RequestHandler = (req, res) => {
  const actorId = requireActor(req);
  const { provider } = req.body as LinkStartInput;

  const authorizeUrl = beginAuthorization(res, provider, null, "link", actorId);

  // Not a redirect endpoint, so an ordinary AppError is the right shape here.
  if (authorizeUrl === null) throw new AppError("not_found", "That provider is unavailable.");

  res.json({ authorizeUrl });
};

export const linkConfirm: RequestHandler = async (req, res) => {
  const { token } = req.body as LinkConfirmInput;

  await oauthService.confirmLink(requireActor(req), token);

  res.status(204).end();
};

export const connections: RequestHandler = async (req, res) => {
  res.json(await oauthService.listConnections(requireActor(req)));
};

export const unlink: RequestHandler = async (req, res) => {
  const { id } = req.params as ConnectionParams;

  await oauthService.unlinkConnection(requireActor(req), id);

  res.status(204).end();
};

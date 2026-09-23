import { Router, type ErrorRequestHandler, type RequestHandler } from "express";

import {
  oauthCallbackLimiter,
  oauthLinkLimiter,
  oauthStartLimiter,
} from "../../middleware/rateLimit.js";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./oauth.controller.js";
import {
  connectionParamsSchema,
  linkConfirmSchema,
  linkStartSchema,
  oauthCallbackSchema,
  oauthStartSchema,
  providerParamsSchema,
} from "./oauth.schema.js";

export const oauthRoutes = Router();

// The two GET routes answer 302 into the browser's address bar, so their
// responses must never be cached: the callback's carries a Set-Cookie, and a
// replayed cached redirect on a shared machine would hand somebody else the
// session.
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("cache-control", "no-store");
  next();
};

// Which buttons the sign-in page should render. A provider with no credentials
// is simply absent, rather than a button that dead-ends.
oauthRoutes.get("/providers", controller.providers);

// Declared before /:provider/* so the literal segment is not swallowed by the
// parameter — the rule route order follows everywhere else here.
oauthRoutes.post(
  "/link/start",
  oauthLinkLimiter,
  requireAuth,
  validate({ body: linkStartSchema }),
  controller.linkStart,
);

oauthRoutes.post(
  "/link/confirm",
  oauthLinkLimiter,
  requireAuth,
  validate({ body: linkConfirmSchema }),
  controller.linkConfirm,
);

oauthRoutes.get("/connections", requireAuth, controller.connections);

oauthRoutes.delete(
  "/connections/:id",
  requireAuth,
  validate({ params: connectionParamsSchema }),
  controller.unlink,
);

// No requireAuth on either: signing in is exactly when there is no session,
// and the callback is a navigation the provider performs, which carries no
// Authorization header at all. The signed oauth_tx cookie is what proves the
// callback belongs to an attempt this browser started.
oauthRoutes.get(
  "/:provider/start",
  noStore,
  oauthStartLimiter,
  validate({ params: providerParamsSchema, query: oauthStartSchema }),
  controller.start,
);

oauthRoutes.get(
  "/:provider/callback",
  noStore,
  oauthCallbackLimiter,
  validate({ params: providerParamsSchema, query: oauthCallbackSchema }),
  controller.callback,
);

// validate() and the rate limiters call next(error) from MIDDLEWARE, so they
// never reach the controller's own try/catch -- an unknown :provider or an
// over-long code would otherwise render a JSON error body in the user's
// browser tab, mid-navigation, with no way back to the app. Only the two
// redirect-shaped GET routes are converted; everything else falls through to
// the global handler, which is the right shape for a fetch caller.
// Matched on the router-relative path rather than the method alone, because
// GET /connections is a fetch caller that must keep receiving JSON — a 401
// there is an answer, not a dead end. The provider segment is left open since
// an unknown one is exactly one of the errors being converted.
const REDIRECT_ROUTES = /^\/[^/]+\/(start|callback)$/;

const redirectErrors: ErrorRequestHandler = (error, req, res, next) => {
  if (req.method !== "GET" || res.headersSent || !REDIRECT_ROUTES.test(req.path)) {
    next(error);

    return;
  }

  res.setHeader("cache-control", "no-store");
  res.redirect(`${env.APP_URL.replace(/\/+$/, "")}/login?error=invalid_request`);
};

oauthRoutes.use(redirectErrors);

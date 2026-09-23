import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import {
  forgotPasswordAddressLimiter,
  forgotPasswordIpLimiter,
  loginAccountLimiter,
  loginIpLimiter,
  refreshLimiter,
  registerLimiter,
  resetPasswordLimiter,
  usernameAvailableLimiter,
} from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./auth.controller.js";
import { oauthRoutes } from "./oauth.routes.js";
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  registerSchema,
  resetPasswordSchema,
  usernameAvailableSchema,
} from "./auth.schema.js";

export const authRoutes = Router();

// Inside the auth module rather than a module of its own: an OAuth sign-in
// ends in this module's issueSession, auth.cookies and PublicUser, and a
// separate module would have to have all three exported to reach them.
authRoutes.use("/oauth", oauthRoutes);

authRoutes.post(
  "/register",
  registerLimiter,
  validate({ body: registerSchema }),
  controller.register,
);

authRoutes.post(
  "/login",
  loginIpLimiter,
  loginAccountLimiter,
  validate({ body: loginSchema }),
  controller.login,
);

// No requireAuth: an expired access token is exactly when this is called.
authRoutes.post("/refresh", refreshLimiter, controller.refresh);

// No requireAuth here either — holding the refresh cookie is proof enough to
// revoke what it grants.
authRoutes.post("/logout", validate({ query: logoutSchema }), controller.logout);

authRoutes.get("/me", requireAuth, controller.me);

authRoutes.post(
  "/password/forgot",
  forgotPasswordIpLimiter,
  forgotPasswordAddressLimiter,
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);

authRoutes.post(
  "/password/reset",
  resetPasswordLimiter,
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);

authRoutes.get(
  "/username-available",
  usernameAvailableLimiter,
  validate({ query: usernameAvailableSchema }),
  controller.usernameAvailable,
);

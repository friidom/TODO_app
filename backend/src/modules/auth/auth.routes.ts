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
import * as controller from "./auth.controller.js";

export const authRoutes = Router();

authRoutes.post("/register", registerLimiter, controller.register);

authRoutes.post("/login", loginIpLimiter, loginAccountLimiter, controller.login);

// No requireAuth: an expired access token is exactly when this is called.
authRoutes.post("/refresh", refreshLimiter, controller.refresh);

// No requireAuth here either — holding the refresh cookie is proof enough to
// revoke what it grants.
authRoutes.post("/logout", controller.logout);

authRoutes.get("/me", requireAuth, controller.me);

authRoutes.post(
  "/password/forgot",
  forgotPasswordIpLimiter,
  forgotPasswordAddressLimiter,
  controller.forgotPassword,
);

authRoutes.post("/password/reset", resetPasswordLimiter, controller.resetPassword);

authRoutes.get("/username-available", usernameAvailableLimiter, controller.usernameAvailable);

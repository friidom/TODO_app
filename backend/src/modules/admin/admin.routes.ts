import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requireSuperadmin } from "../../middleware/requireSuperadmin.js";
import * as controller from "./admin.controller.js";

// EVERY route in this file carries requireAuth -> requireSuperadmin, and
// admin.routes.parity.test.ts walks the router's own stack to prove it rather
// than trusting that the next person remembers. There is no app.use() shortcut
// mounting the pair once: a router-level guard is invisible at the call site,
// and this is the one module where a missing check leaks every board in the
// system instead of one.
export const adminRoutes = Router();

adminRoutes.get("/ping", requireAuth, requireSuperadmin, controller.ping);

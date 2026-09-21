import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requireSuperadmin } from "../../middleware/requireSuperadmin.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./admin.controller.js";
import {
  activityQuerySchema,
  auditQuerySchema,
  boardParamsSchema,
  boardsQuerySchema,
  flowQuerySchema,
  kpiParamsSchema,
  kpiTargetSchema,
  periodQuerySchema,
  spaceParamsSchema,
  todoParamsSchema,
  updateUserSchema,
  userParamsSchema,
  userQuerySchema,
} from "./admin.schema.js";

// EVERY route in this file carries requireAuth -> requireSuperadmin, and
// admin.routes.parity.test.ts walks the router's own stack to prove it rather
// than trusting that the next person remembers. There is no router-level
// app.use() mounting the pair once: a guard that is invisible at the call
// site is one nobody notices is missing, and this is the module where a
// missing check leaks every board in the system rather than one.
//
// There is no boardAccess here and there cannot be — these routes are not
// board-scoped. That makes the repo's own scoping its own responsibility,
// which admin.repo.ts's header says outright.
const gate = [requireAuth, requireSuperadmin] as const;

export const adminRoutes = Router();

adminRoutes.get("/ping", ...gate, controller.ping);

adminRoutes.get("/overview", ...gate, validate({ query: periodQuerySchema }), controller.overview);

adminRoutes.get("/flow", ...gate, validate({ query: flowQuerySchema }), controller.flow);

// Literal before parameter: /users/:id would otherwise swallow nothing here
// today, but the ordering rule is kept so adding /users/active later is not a
// silent 404 (CONVENTIONS.md).
adminRoutes.get("/users", ...gate, validate({ query: userQuerySchema }), controller.listUsers);

adminRoutes.get(
  "/users/:id",
  ...gate,
  validate({ params: userParamsSchema, query: userQuerySchema }),
  controller.getUser,
);

// The one write on a user, and it sets seniority only (D-14).
adminRoutes.patch(
  "/users/:id",
  ...gate,
  validate({ params: userParamsSchema, body: updateUserSchema }),
  controller.updateUser,
);

adminRoutes.get("/boards", ...gate, validate({ query: boardsQuerySchema }), controller.listBoards);

adminRoutes.get(
  "/boards/:id",
  ...gate,
  validate({ params: boardParamsSchema, query: periodQuerySchema }),
  controller.getBoard,
);

adminRoutes.get("/spaces", ...gate, validate({ query: periodQuerySchema }), controller.listSpaces);

adminRoutes.get(
  "/spaces/:id",
  ...gate,
  validate({ params: spaceParamsSchema, query: periodQuerySchema }),
  controller.getSpace,
);

adminRoutes.get(
  "/todos/:id",
  ...gate,
  validate({ params: todoParamsSchema }),
  controller.getTodo,
);

adminRoutes.get(
  "/activity",
  ...gate,
  validate({ query: activityQuerySchema }),
  controller.listActivity,
);

adminRoutes.get("/kpi", ...gate, controller.getKpi);

adminRoutes.put(
  "/kpi/:seniority",
  ...gate,
  validate({ params: kpiParamsSchema, body: kpiTargetSchema }),
  controller.putKpi,
);

adminRoutes.get("/audit", ...gate, validate({ query: auditQuerySchema }), controller.listAudit);

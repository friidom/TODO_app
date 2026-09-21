import { z } from "zod";

import { ADMIN_PERIODS, DEFAULT_PERIOD } from "./periods.js";

export const SENIORITIES = ["junior", "middle", "senior"] as const;

export const ACTIVITY_PAGE = 50;
const MAX_ACTIVITY_PAGE = 200;
const MAX_AUDIT_PAGE = 200;

// The enum IS the parity mechanism between this package and the frontend's
// copy of the six values: a period the client invents cannot be silently
// coerced into a default here, it is a 400 on the first request.
const period = z.enum(ADMIN_PERIODS).default(DEFAULT_PERIOD);

export const periodQuerySchema = z.object({ period });

export const FLOW_SLICES = ["estimate", "priority", "type"] as const;

export const flowQuerySchema = z.object({
  period,
  space: z.uuid().optional(),
  board: z.uuid().optional(),
  slice: z.enum(FLOW_SLICES).default("estimate"),
});

export type FlowQuery = z.infer<typeof flowQuerySchema>;

export const userQuerySchema = z.object({
  period,
  space: z.uuid().optional(),
  board: z.uuid().optional(),
});

export type UserQuery = z.infer<typeof userQuerySchema>;

export const boardsQuerySchema = z.object({
  period,
  space: z.uuid().optional(),
});

export type BoardsQuery = z.infer<typeof boardsQuerySchema>;

export const activityQuerySchema = z.object({
  period,
  user: z.uuid().optional(),
  board: z.uuid().optional(),
  space: z.uuid().optional(),
  action: z.string().min(1).max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_ACTIVITY_PAGE).default(ACTIVITY_PAGE),
  // The keyset cursor, both halves or neither — a created_at without its id
  // cannot break a tie and would drop or repeat rows sharing a timestamp.
  before: z.coerce.date().optional(),
  before_id: z.uuid().optional(),
});

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_AUDIT_PAGE).default(MAX_AUDIT_PAGE),
});

export const userParamsSchema = z.object({ id: z.uuid() });

export const boardParamsSchema = z.object({ id: z.uuid() });

export const spaceParamsSchema = z.object({ id: z.uuid() });

export const todoParamsSchema = z.object({ id: z.uuid() });

export type TodoParams = z.infer<typeof todoParamsSchema>;

export const TASK_ACTIVITY = 20;

export type SpaceParams = z.infer<typeof spaceParamsSchema>;

export const kpiParamsSchema = z.object({ seniority: z.enum(SENIORITIES) });

// Non-negative, and finite. A target of zero is meaningful — it says this
// level is not measured on points — which is why the floor is 0 and not 1.
const points = z.coerce.number().finite().min(0).max(100_000);

export const kpiTargetSchema = z.object({
  daily_points: points,
  weekly_points: points,
});

// seniority and nothing else (M34 D-14). This endpoint exists so the KPI
// layer can produce a figure at all; widening it to other user fields would
// make M34 an account-administration surface, which it is explicitly not.
// null is accepted and meaningful: it returns the user to "unclassified",
// which is a real state rather than a missing one.
// .strict(): an unknown key is a 400, not silently dropped. Zod strips by
// default, which would answer 200 to a caller that sent org_role -- telling
// them a privilege change succeeded when it was quietly ignored.
export const updateUserSchema = z
  .object({
    seniority: z.enum(SENIORITIES).nullable(),
  })
  .strict();

export type PeriodQuery = z.infer<typeof periodQuerySchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type UserParams = z.infer<typeof userParamsSchema>;
export type BoardParams = z.infer<typeof boardParamsSchema>;
export type KpiParams = z.infer<typeof kpiParamsSchema>;
export type KpiTargetInput = z.infer<typeof kpiTargetSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

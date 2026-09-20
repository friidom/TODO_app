import type { RequestHandler } from "express";

import { requireActor } from "../../middleware/requireAuth.js";
import * as adminService from "./admin.service.js";
import type {
  ActivityQuery,
  AuditQuery,
  BoardParams,
  KpiParams,
  KpiTargetInput,
  PeriodQuery,
  UpdateUserInput,
  UserParams,
} from "./admin.schema.js";

// req.query is read as `unknown as` rather than a plain cast: validate()
// replaced it with the parsed object, and z.coerce turns `period`'s siblings
// into numbers and Dates, which no longer overlap ParsedQs's string index
// signature (CONVENTIONS.md).

export const ping: RequestHandler = (_req, res) => {
  res.json({ ok: true });
};

export const overview: RequestHandler = async (req, res) => {
  const { period } = req.query as unknown as PeriodQuery;

  res.json(await adminService.overview(period));
};

export const listUsers: RequestHandler = async (req, res) => {
  const { period } = req.query as unknown as PeriodQuery;

  res.json(await adminService.users(period));
};

export const getUser: RequestHandler = async (req, res) => {
  const { id } = req.params as unknown as UserParams;
  const { period } = req.query as unknown as PeriodQuery;

  res.json(await adminService.user(id, period));
};

export const updateUser: RequestHandler = async (req, res) => {
  const { id } = req.params as unknown as UserParams;
  const { seniority } = req.body as UpdateUserInput;

  res.json(await adminService.setSeniority(id, seniority, requireActor(req)));
};

export const listBoards: RequestHandler = async (req, res) => {
  const { period } = req.query as unknown as PeriodQuery;

  res.json(await adminService.boards(period));
};

export const getBoard: RequestHandler = async (req, res) => {
  const { id } = req.params as unknown as BoardParams;
  const { period } = req.query as unknown as PeriodQuery;

  res.json(await adminService.board(id, period));
};

export const listActivity: RequestHandler = async (req, res) => {
  res.json(await adminService.activity(req.query as unknown as ActivityQuery));
};

export const getKpi: RequestHandler = async (_req, res) => {
  res.json(await adminService.kpi());
};

export const putKpi: RequestHandler = async (req, res) => {
  const { seniority } = req.params as unknown as KpiParams;

  res.json(
    await adminService.setKpiTarget(seniority, req.body as KpiTargetInput, requireActor(req)),
  );
};

export const listAudit: RequestHandler = async (req, res) => {
  const { limit } = req.query as unknown as AuditQuery;

  res.json(await adminService.audit(limit));
};

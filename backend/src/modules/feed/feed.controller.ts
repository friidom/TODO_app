import type { RequestHandler } from "express";

import { requireActor } from "../../middleware/requireAuth.js";
import * as feedService from "./feed.service.js";
import type { ByIdsQuery, FeedQuery, WorkedOnQuery } from "./feed.schema.js";

export const feed: RequestHandler = async (req, res) => {
  const { tab, limit } = req.query as unknown as FeedQuery;

  res.json(await feedService.feed({ id: requireActor(req) }, tab, limit));
};

export const workedOn: RequestHandler = async (req, res) => {
  const { limit } = req.query as unknown as WorkedOnQuery;

  res.json(await feedService.workedOn({ id: requireActor(req) }, limit));
};

export const byIds: RequestHandler = async (req, res) => {
  const { ids } = req.query as unknown as ByIdsQuery;

  res.json(await feedService.byIds({ id: requireActor(req) }, ids));
};

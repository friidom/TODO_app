import type { RequestHandler } from "express";

import { requireActor } from "../../middleware/requireAuth.js";
import * as feedService from "./feed.service.js";
import type { FeedQuery } from "./feed.schema.js";

export const feed: RequestHandler = async (req, res) => {
  const { tab, limit } = req.query as unknown as FeedQuery;

  res.json(await feedService.feed({ id: requireActor(req) }, tab, limit));
};

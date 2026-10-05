import type { RequestHandler } from "express";

import { requireActor } from "../../middleware/requireAuth.js";
import * as taskRefsService from "./taskRefs.service.js";
import type { TaskRefParams } from "./taskRefs.schema.js";

export const resolve: RequestHandler = async (req, res) => {
  const { ref } = req.params as TaskRefParams;

  res.json(await taskRefsService.resolve(requireActor(req), ref));
};

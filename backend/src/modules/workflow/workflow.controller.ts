import type { RequestHandler } from "express";

import { sendCached } from "../../cache/cache.js";
import { boardCache } from "../../cache/keys.js";
import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as workflowService from "./workflow.service.js";
import type { PublishWorkflowInput } from "./workflow.schema.js";

export const get: RequestHandler = async (req, res) => {
  const boardId = requireBoard(req).id;

  await sendCached(res, boardCache.workflow(boardId), () => workflowService.snapshot(boardId));
};

export const publish: RequestHandler = async (req, res) => {
  res.json(
    await workflowService.publish(
      { id: requireActor(req) },
      requireBoard(req).id,
      req.body as PublishWorkflowInput,
    ),
  );
};

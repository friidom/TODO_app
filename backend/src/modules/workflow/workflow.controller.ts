import type { RequestHandler } from "express";

import { requireBoard } from "../../middleware/boardAccess.js";
import { requireActor } from "../../middleware/requireAuth.js";
import * as workflowService from "./workflow.service.js";
import type { PublishWorkflowInput } from "./workflow.schema.js";

export const get: RequestHandler = async (req, res) => {
  res.json(await workflowService.snapshot(requireBoard(req).id));
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

import type { RequestHandler } from "express";

import { requireActor } from "../../middleware/requireAuth.js";
import * as notificationsRepo from "./notifications.repo.js";
import type { MarkReadInput, NotificationQuery } from "./notifications.schema.js";

export const list: RequestHandler = async (req, res) => {
  const { limit } = req.query as unknown as NotificationQuery;

  res.json(await notificationsRepo.findForUser(requireActor(req), limit));
};

export const unreadCount: RequestHandler = async (req, res) => {
  res.json({ count: await notificationsRepo.countUnread(requireActor(req)) });
};

export const markRead: RequestHandler = async (req, res) => {
  const { ids } = req.body as MarkReadInput;

  res.json({ marked: await notificationsRepo.markRead(requireActor(req), ids) });
};

export const markAllRead: RequestHandler = async (req, res) => {
  res.json({ marked: await notificationsRepo.markAllRead(requireActor(req)) });
};

import { z } from "zod";

import { MAX_PAGE, NOTIFICATION_PAGE } from "../../config/constants.js";

export const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(NOTIFICATION_PAGE),
});

export const markReadSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(MAX_PAGE),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;

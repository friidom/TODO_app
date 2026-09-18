import { z } from "zod";

// spaces_title_length: between 1 and 60 characters after btrim.
const title = z.string().trim().min(1).max(60);

export const createSpaceSchema = z.object({ id: z.uuid().optional(), title });

export const updateSpaceSchema = z.object({ title });

export const spaceParamsSchema = z.object({ spaceId: z.uuid() });

export type SpaceParams = z.infer<typeof spaceParamsSchema>;
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;

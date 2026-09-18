import { z } from "zod";

// comments_content_not_blank: length(btrim(content)) > 0. No maximum in the
// schema either, deliberately.
const content = z.string().trim().min(1);

export const createCommentSchema = z.object({ id: z.uuid().optional(), content });

// content and nothing else. board_id, todo_id, author_id and created_at are
// absent so they cannot be rewritten by an author editing their own words.
export const updateCommentSchema = z.object({ content });

export const commentParamsSchema = z.object({ commentId: z.uuid() });

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type CommentParams = z.infer<typeof commentParamsSchema>;

import { z } from "zod";

export const attachmentParamsSchema = z.object({
  todoId: z.uuid(),
  attachmentId: z.uuid(),
});

// The client asks; canRenderInline in attachments.files.ts decides. A mime that
// cannot be rendered safely is served as a download however this reads.
export const attachmentContentQuerySchema = z.object({
  disposition: z.enum(["attachment", "inline"]).default("attachment"),
});

export type AttachmentParams = z.infer<typeof attachmentParamsSchema>;
export type AttachmentContentQuery = z.infer<typeof attachmentContentQuerySchema>;

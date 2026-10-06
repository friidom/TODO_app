import { z } from "zod";

import { MAX_PAGE } from "../../config/constants.js";
import { signingSecretError, type SigningSecretError } from "../../lib/webhookSignature.js";
import { parseProjectUrl, type ProjectUrlError } from "./gitlab.links.js";

const PROJECT_URL_MESSAGES: Record<ProjectUrlError, string> = {
  https: "must be an https:// address.",
  url: "is not a GitLab project address.",
  path: "must name a project, such as group/project.",
};

const SIGNING_TOKEN_MESSAGES: Record<SigningSecretError, string> = {
  prefix: "must start with whsec_ — copy the whole signing token from GitLab.",
  encoding: "is not a GitLab signing token.",
  length: "is not a GitLab signing token.",
};

export const connectProjectSchema = z
  .object({ project_url: z.string().max(2048) })
  .transform(({ project_url }, ctx) => {
    const parsed = parseProjectUrl(project_url);

    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", path: ["project_url"], message: PROJECT_URL_MESSAGES[parsed.error] });

      return z.NEVER;
    }

    return { instance_url: parsed.instance_url, project_path: parsed.project_path };
  });

// Trimmed because a token is pasted, and a stray newline is not a different
// token. Its value is never echoed: a ZodError reaches the client as the field
// name and the rule only.
export const signingTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .max(512)
    .superRefine((value, ctx) => {
      const error = signingSecretError(value);

      if (error !== undefined) ctx.addIssue({ code: "custom", message: SIGNING_TOKEN_MESSAGES[error] });
    }),
});

export const linkParamsSchema = z.object({ linkId: z.uuid() });

// Unbounded by default, like a card's activity history: a default limit would
// silently drop a busy card's older commits.
export const developmentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).optional(),
});

export type ConnectProjectInput = z.infer<typeof connectProjectSchema>;
export type SigningTokenInput = z.infer<typeof signingTokenSchema>;
export type LinkParams = z.infer<typeof linkParamsSchema>;
export type DevelopmentQuery = z.infer<typeof developmentQuerySchema>;

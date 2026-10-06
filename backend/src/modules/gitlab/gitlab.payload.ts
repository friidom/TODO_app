import { z } from "zod";

// Only the fields Veylo reads, checked for shape. Everything else GitLab sends
// (emails, avatars, file lists, repository urls) is dropped at the door.

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

// GitLab has sent both ISO 8601 and "2013-12-03 17:23:34 UTC" over the years.
function gitlabTime(value: string): Date | null {
  const parsed = Date.parse(value.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/, "$1T$2Z"));

  return Number.isNaN(parsed) ? null : new Date(parsed);
}

const timestamp = z.string().transform((value, ctx) => {
  const date = gitlabTime(value);

  if (date === null) {
    ctx.addIssue({ code: "custom", message: "is not a timestamp" });

    return z.NEVER;
  }

  return date;
});

const project = z.object({
  id: z.number().int().positive(),
  path_with_namespace: z.string().min(1).max(1024),
  web_url: z.url().max(2048),
});

const pushCommit = z.object({
  id: z.string().regex(SHA),
  message: z.string(),
  title: z.string().optional(),
  timestamp,
  author: z.object({ name: z.string() }),
});

export const pushEventSchema = z.object({
  object_kind: z.literal("push"),
  ref: z.string().min(1).max(1024),
  before: z.string().regex(SHA),
  after: z.string().regex(SHA),
  total_commits_count: z.number().int().nonnegative().optional(),
  project,
  // GitLab caps the list at the newest 20; the margin only tolerates a change.
  commits: z.array(pushCommit).max(100),
});

export const mergeRequestEventSchema = z.object({
  object_kind: z.literal("merge_request"),
  project,
  object_attributes: z.object({
    iid: z.number().int().positive().max(2_147_483_647),
    title: z.string(),
    description: z.string().nullish(),
    state: z.enum(["opened", "closed", "merged", "locked"]),
    source_branch: z.string().min(1).max(1024),
    target_branch: z.string().min(1).max(1024),
    updated_at: timestamp,
  }),
});

export type PushEvent = z.infer<typeof pushEventSchema>;
export type MergeRequestEvent = z.infer<typeof mergeRequestEventSchema>;
export type GitLabProject = z.infer<typeof project>;

export type ParsedEvent =
  | { kind: "push"; event: PushEvent }
  | { kind: "merge_request"; event: MergeRequestEvent }
  | { kind: "other"; project: GitLabProject | null }
  | { kind: "invalid" };

export function parseEvent(payload: unknown): ParsedEvent {
  if (typeof payload !== "object" || payload === null) return { kind: "invalid" };

  const { object_kind: objectKind, project: rawProject } = payload as { object_kind?: unknown; project?: unknown };

  if (objectKind === "push") {
    const parsed = pushEventSchema.safeParse(payload);

    return parsed.success ? { kind: "push", event: parsed.data } : { kind: "invalid" };
  }

  if (objectKind === "merge_request") {
    const parsed = mergeRequestEventSchema.safeParse(payload);

    return parsed.success ? { kind: "merge_request", event: parsed.data } : { kind: "invalid" };
  }

  const other = project.safeParse(rawProject);

  return { kind: "other", project: other.success ? other.data : null };
}

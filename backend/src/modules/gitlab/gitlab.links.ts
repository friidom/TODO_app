const DEFAULT_INSTANCE = "https://gitlab.com";
const INSTANCE = /^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/;
const PROJECT_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+$/;
const MAX_PROJECT_PATH = 255;

export type ProjectUrlError = "https" | "url" | "path";

export type ParsedProjectUrl =
  | { ok: true; instance_url: string; project_path: string }
  | { ok: false; error: ProjectUrlError };

// Accepts what an admin is likely to paste: the project's address, its clone
// url, a page inside it, or just group/project for GitLab.com.
export function parseProjectUrl(input: string): ParsedProjectUrl {
  const raw = input.trim();
  let instance = DEFAULT_INSTANCE;
  let path = raw;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let url: URL;

    try {
      url = new URL(raw);
    } catch {
      return { ok: false, error: "url" };
    }

    if (url.protocol !== "https:") return { ok: false, error: "https" };

    if (url.username !== "" || url.password !== "" || !INSTANCE.test(url.origin)) {
      return { ok: false, error: "url" };
    }

    instance = url.origin;
    path = url.pathname;
  } else if (/^gitlab\.com\//i.test(raw)) {
    path = raw.slice("gitlab.com/".length);
  }

  const projectPath = path
    .split("/-/")[0]!
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "");

  if (
    projectPath.length > MAX_PROJECT_PATH ||
    !PROJECT_PATH.test(projectPath) ||
    projectPath.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return { ok: false, error: "path" };
  }

  return { ok: true, instance_url: instance, project_path: projectPath };
}

export type LinkStatus = "awaiting_token" | "awaiting_delivery" | "active" | "failing";

interface LinkState {
  signing_token_set_at: Date | null;
  last_delivery_at: Date | null;
  last_failure_at: Date | null;
}

// A failure only counts if nothing has happened since: a newer verified
// delivery, or a token saved after it, means the admin has already fixed it.
export function linkStatus({ signing_token_set_at, last_delivery_at, last_failure_at }: LinkState): LinkStatus {
  if (signing_token_set_at === null) return "awaiting_token";

  const settled = Math.max(signing_token_set_at.getTime(), last_delivery_at?.getTime() ?? 0);

  if (last_failure_at !== null && last_failure_at.getTime() > settled) return "failing";

  return last_delivery_at === null ? "awaiting_delivery" : "active";
}

interface ProjectLocation {
  instance_url: string;
  project_path: string;
  project_web_url: string | null;
}

// GitLab's own address for the project once a delivery has reported it, so a
// rename or transfer in GitLab is reflected without the admin reconnecting.
export function projectUrl({ instance_url, project_path, project_web_url }: ProjectLocation): string {
  return project_web_url ?? `${instance_url}/${project_path}`;
}

export function projectPathOf(location: ProjectLocation): string {
  if (location.project_web_url === null) return location.project_path;

  return new URL(location.project_web_url).pathname.replace(/^\/+/, "");
}

export function commitUrl(projectWebUrl: string, sha: string): string {
  return `${projectWebUrl}/-/commit/${sha}`;
}

export function branchUrl(projectWebUrl: string, name: string): string {
  return `${projectWebUrl}/-/tree/${name.split("/").map(encodeURIComponent).join("/")}`;
}

export function mergeRequestUrl(projectWebUrl: string, iid: number): string {
  return `${projectWebUrl}/-/merge_requests/${iid}`;
}

// An origin carries no /api/v1 of its own, so it gets the full path app.ts
// mounts the receiver on; API_PUBLIC_URL already ends in /api/v1.
export function buildWebhookUrl(
  linkId: string,
  { apiPublicUrl, webhookPublicOrigin }: { apiPublicUrl: string; webhookPublicOrigin: string | undefined },
): string {
  const base =
    webhookPublicOrigin === undefined
      ? apiPublicUrl.replace(/\/+$/, "")
      : `${webhookPublicOrigin.replace(/\/+$/, "")}/api/v1`;

  return `${base}/integrations/gitlab/webhooks/${linkId}`;
}

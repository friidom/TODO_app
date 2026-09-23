const baseUrl = import.meta.env.VITE_API_URL;

// Exported so the socket can derive its origin from the same value rather
// than reading the environment a second time.
export { baseUrl as apiBaseUrl };

// At module load, so a missing variable names itself at startup rather than
// surfacing as an opaque failure on the first query.
if (!baseUrl) {
  throw new Error(
    "Missing environment variable VITE_API_URL — add it to .env and restart the dev server.",
  );
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

let accessToken: string | null = null;

// Lets a tab that queued for the refresh lock tell whether another tab
// refreshed while it waited.
let epoch = 0;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  epoch += 1;
}

export function getAccessToken(): string | null {
  return accessToken;
}

type Handler = () => void;

let onSessionEnded: Handler = () => {};

export function setSessionEndedHandler(handler: Handler): void {
  onSessionEnded = handler;
}

const channel =
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("kan:auth");

interface AuthMessage {
  type: "refreshed" | "signed-out";
  accessToken?: string | null;
}

channel?.addEventListener("message", (event: MessageEvent<AuthMessage>) => {
  if (event.data.type === "refreshed") {
    accessToken = event.data.accessToken ?? null;
    epoch += 1;

    return;
  }

  accessToken = null;
  epoch += 1;
  onSessionEnded();
});

// Replaces what onAuthStateChange gave for free: two users share one browser.
export function broadcastSignOut(): void {
  channel?.postMessage({ type: "signed-out" } satisfies AuthMessage);
}

// Web Locks is the only cross-tab primitive with real mutual exclusion. Where it
// is missing, refreshInFlight still serialises one tab and two tabs race, which
// is the pre-existing behaviour rather than a new failure.
function withRefreshLock<T>(run: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;

  return locks ? locks.request("kan:auth-refresh", run) : run();
}

async function postRefresh(): Promise<boolean> {
  const response = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) return false;

  const body = (await response.json()) as { accessToken?: unknown };

  if (typeof body.accessToken !== "string") return false;

  setAccessToken(body.accessToken);
  channel?.postMessage({ type: "refreshed", accessToken: body.accessToken } satisfies AuthMessage);

  return true;
}

let refreshInFlight: Promise<boolean> | null = null;

// Presenting an already-rotated refresh token revokes the whole family, by
// design — so two concurrent refreshes on one cookie read as theft and sign the
// user out everywhere. Two tabs loading at once is enough to trigger it.
export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const before = epoch;

  const pending = (async () => {
    try {
      return await withRefreshLock(async () => {
        // Another tab refreshed while this one queued; its token already arrived.
        if (epoch !== before && accessToken !== null) return true;

        return postRefresh();
      });
    } finally {
      refreshInFlight = null;
    }
  })();

  refreshInFlight = pending;

  return pending;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  // Session-establishing endpoints must not refresh on a 401: there the 401 is
  // the answer, not a stale token.
  anonymous?: boolean;
}

function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  // The multipart boundary is part of the content-type and only fetch knows
  // it, so naming the type here would make the body unparseable.
  const form = options.body instanceof FormData;

  if (options.body !== undefined && !form) headers["content-type"] = "application/json";

  if (!options.anonymous && accessToken !== null) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    signal: options.signal,
    body:
      options.body === undefined
        ? undefined
        : form
          ? (options.body as FormData)
          : JSON.stringify(options.body),
  });
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = "unknown";
  let message = response.statusText || `Request failed with status ${response.status}`;

  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };

    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    // A proxy or a crash can answer with something that is not our error shape.
  }

  return new ApiError(response.status, code, message);
}

async function sendAuthorized(path: string, options: RequestOptions): Promise<Response> {
  let response = await send(path, options);

  if (response.status === 401 && !options.anonymous) {
    if (await refreshSession()) {
      response = await send(path, options);
    }

    // A second 401 after a successful refresh means the session is gone.
    if (response.status === 401) {
      setAccessToken(null);
      onSessionEnded();
    }
  }

  if (!response.ok) throw await toApiError(response);

  return response;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await sendAuthorized(path, options);

  if (response.status === 204) return undefined as T;

  const text = await response.text();

  return (text === "" ? undefined : JSON.parse(text)) as T;
}

// The bytes of a response rather than its JSON — an attachment is read through
// the same authorized path as everything else, and the token is in memory, so
// an <img src> or a bare link could never fetch one.
export async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  return (await sendAuthorized(path, options)).blob();
}

export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }

  const query = search.toString();

  return query === "" ? "" : `?${query}`;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  del: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE", body }),
  blob: (path: string, options?: RequestOptions) => requestBlob(path, { ...options }),
};

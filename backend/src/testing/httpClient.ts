import type { Server } from "node:http";

import type { Express } from "express";

import { app as realApp } from "../app.js";

export interface TestResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
  cookies: string[];
}

interface RequestOptions {
  token?: string;
  cookie?: string;
}

export interface TestClient {
  url: string;
  get<T = unknown>(path: string, options?: RequestOptions): Promise<TestResponse<T>>;
  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse<T>>;
  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse<T>>;
  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse<T>>;
  del<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse<T>>;
  close(): Promise<void>;
}

// Over a real socket rather than a mocked req/res, so Express's own routing,
// body parsing and error handling are all in the path — the parts a hand-built
// fake is most likely to get wrong.
export async function startTestServer(instance: Express = realApp): Promise<TestClient> {
  const server = await new Promise<Server>((resolve, reject) => {
    const listener = instance.listen(0, () => resolve(listener));

    listener.on("error", reject);
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("test server did not bind a port");
  }

  const url = `http://127.0.0.1:${address.port}`;

  async function send<T>(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<TestResponse<T>> {
    const headers: Record<string, string> = {};

    if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
    if (options.cookie !== undefined) headers.cookie = options.cookie;
    if (body !== undefined) headers["content-type"] = "application/json";

    const response = await fetch(`${url}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();

    return {
      status: response.status,
      // A 204 and an HTML error page both have no JSON to give; the raw text
      // is more useful in a failure message than a parse error would be.
      body: (text === "" ? undefined : safeParse(text)) as T,
      headers: response.headers,
      cookies: response.headers.getSetCookie(),
    };
  }

  return {
    url,
    get: (path, options) => send("GET", path, undefined, options),
    post: (path, body, options) => send("POST", path, body, options),
    patch: (path, body, options) => send("PATCH", path, body, options),
    put: (path, body, options) => send("PUT", path, body, options),
    del: (path, body, options) => send("DELETE", path, body, options),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

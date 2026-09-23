import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env.js";
import { query } from "./db/client.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { redactUrl } from "./lib/redact.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

// contentSecurityPolicy off: nothing here serves HTML.
app.use(helmet({ contentSecurityPolicy: false }));

// credentials:true forbids origin "*", so the origin stays pinned to one value
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
// Overrides morgan's built-in :url token, which both "dev" and "combined"
// print verbatim -- so every OAuth callback would write a live authorization
// code to stdout. morgan writes through process.stdout rather than console.*,
// so verifyAuth's console capture could never have caught it.
morgan.token("url", (req) =>
  redactUrl((req as { originalUrl?: string; url?: string }).originalUrl ?? (req as { url?: string }).url ?? ""),
);

// The "combined" format used in production also prints :referrer, which is an
// incoming header and can therefore carry someone else's URL -- including one
// still holding a link token.
morgan.token("referrer", (req) => {
  const value = (req as { headers?: Record<string, unknown> }).headers?.referer;

  return typeof value === "string" ? redactUrl(value) : undefined;
});

// Skipped under test: an access log per request buries the assertion that failed.
if (env.NODE_ENV !== "test") {
  app.use(morgan(env.isProduction ? "combined" : "dev"));
}

// Outside /api/v1 on purpose: uptime checks and load balancers should not have
// to track the API's version prefix.
app.get("/health", async (_req: Request, res: Response) => {
  try {
    await query("select 1");

    res.json({ status: "ok", database: "up" });
  } catch {
    res.status(503).json({ status: "degraded", database: "down" });
  }
});

app.use("/api/v1", apiRouter);

// both fallbacks must stay last — an earlier 404 would swallow later routes
app.use(notFoundHandler);
app.use(errorHandler);

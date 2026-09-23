import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { AppError, toAppError } from "../lib/errors.js";
import { redactUrl } from "../lib/redact.js";

export function notFoundHandler(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(new AppError("not_found", "Not found"));
}

// Express detects an error handler by its arity, so _next must stay even
// though the common path never calls it.
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // A stream that has already started cannot be turned into a JSON error;
  // Express's built-in handler is the only thing that can close it properly.
  if (res.headersSent) {
    next(error);

    return;
  }

  const appError = toAppError(error);

  // Redacted because a failed OAuth exchange reaches here with the live
  // authorization code still in the query string.
  const url = redactUrl(req.originalUrl);

  // The database speaks the server's locale and names its own constraints, so
  // its message is for the log only. The client gets the mapped message.
  if (appError.status >= 500) {
    console.error(`[api] ${req.method} ${url} ->`, error);
  } else if (!env.isProduction) {
    console.warn(
      `[api] ${req.method} ${url} -> ${appError.status} ${appError.code}: ${appError.message}`,
    );
  }

  res.status(appError.status).json({
    error: { code: appError.code, message: appError.message },
  });
}

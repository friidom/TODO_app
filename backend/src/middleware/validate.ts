import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

interface Schemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

// Parses in place so a handler reads the coerced, trimmed value rather than
// the raw one. The ZodError travels to errorHandler, which already turns it
// into a 400 naming the field and never the value (a value here can be a
// password).
//
// req.query has only a getter in Express 5, so the parsed result is redefined
// onto the request rather than assigned.
export function validate(schemas: Schemas): RequestHandler {
  return function validateRequest(req: Request, _res: Response, next: NextFunction): void {
    try {
      if (schemas.params !== undefined) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }

      if (schemas.body !== undefined) {
        req.body = schemas.body.parse(req.body);
      }

      if (schemas.query !== undefined) {
        Object.defineProperty(req, "query", {
          value: schemas.query.parse(req.query),
          configurable: true,
          enumerable: true,
          writable: true,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

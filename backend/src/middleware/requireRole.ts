import type { NextFunction, Request, Response } from "express";

import { AppError } from "../lib/errors.js";
import { roleRank, type BoardRole } from "../lib/permissions.js";
import { requireBoard } from "./boardAccess.js";

// 403 here, not 404: by the time this runs, boardAccess has established that
// the actor IS a member, so the board's existence is already known to them.
// Hiding it further would only confuse a legitimate viewer.
//
// Rank is the whole check. Rules rank cannot express — the author of a
// comment, the uploader of an attachment — live in the service layer and call
// canDeleteComment / canDeleteAttachment from lib/permissions.ts.
export function requireRole(minimum: BoardRole) {
  const floor = roleRank(minimum);

  if (floor === null) throw new Error(`requireRole called with an unknown role: ${minimum}`);

  return function roleGate(req: Request, _res: Response, next: NextFunction): void {
    try {
      const rank = roleRank(requireBoard(req).role);

      if (rank === null || rank < floor) {
        next(new AppError("forbidden", "You do not have permission to do that."));

        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

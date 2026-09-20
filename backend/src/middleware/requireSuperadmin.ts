import type { NextFunction, Request, Response } from "express";

import { prisma } from "../db/prisma.js";
import { AppError } from "../lib/errors.js";
import { isOrgRole } from "../types/actor.js";
import { requireActor } from "./requireAuth.js";

// 404, NOT 403 — boardAccess's rule, for boardAccess's reason. A 403 confirms
// that /admin exists and is worth attacking to anyone who probes for it; a 404
// makes the whole surface indistinguishable from a typo.
function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

// Read per request, never a token claim (M34 D-2). lib/tokens.ts refuses a
// role claim for BOARD roles because "a demotion takes 15 minutes to bite",
// and that argument is stronger here, not weaker: a revoked superadmin holding
// system-wide read for the rest of an access token's life is the worst version
// of it. One primary-key lookup, only on /admin.
export async function requireSuperadmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorId = requireActor(req);

    const row = await prisma.users.findUnique({
      where: { id: actorId },
      select: { org_role: true, deactivated_at: true },
    });

    if (row === null || row.deactivated_at !== null || row.org_role !== "superadmin") {
      next(notFound());

      return;
    }

    // The actor carries its role onward so a handler never has to ask again.
    req.actor = { id: actorId, orgRole: isOrgRole(row.org_role) ? row.org_role : "member" };
    next();
  } catch (error) {
    next(error);
  }
}

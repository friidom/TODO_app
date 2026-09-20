import type { BoardRole } from "../lib/permissions.js";
import type { Actor } from "./actor.js";

// Both are optional because the type cannot express "set by an earlier
// middleware". requireActor() and requireBoard() do that check at runtime, and
// both throw a 500 rather than a 401/404 — reaching a handler without its
// middleware is a wiring bug, not something a client did.
declare module "express-serve-static-core" {
  interface Request {
    actor?: Actor;
    board?: { id: string; role: BoardRole };
  }
}

export {};

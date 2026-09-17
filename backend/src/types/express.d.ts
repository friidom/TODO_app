// Optional because the type can't express "set by requireAuth" —
// requireActor() does that check at runtime instead.
declare module "express-serve-static-core" {
  interface Request {
    actor?: { id: string };
  }
}

export {};

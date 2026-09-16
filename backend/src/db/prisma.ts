import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { pool } from "./client.js";

// Prisma borrows db/client.ts's pool rather than opening its own: two pools
// against one database double the connection count and make max_connections
// twice as hard to reason about.
//
// disposeExternalPool must stay false. $disconnect would otherwise end a pool
// that client.ts owns and /health still queries.
const adapter = new PrismaPg(pool, { disposeExternalPool: false });

export const prisma = new PrismaClient({ adapter });

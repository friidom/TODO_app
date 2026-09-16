import type { Prisma } from "@prisma/client";

import { prisma } from "./prisma.js";

// The five ported trigger functions that stamp who-did-this
// (log_todo_activity, log_column_activity, log_member_activity,
// notify_on_assignment, boards_space_ownership) read this value with
// current_setting('app.actor_id', true). set_config's third argument makes
// the setting transaction-local — SET LOCAL's semantics — so it cannot leak
// to another request on a pooled connection, and it is cleared automatically
// when the transaction ends, whether by commit or rollback.
//
// SET LOCAL app.actor_id = $1 cannot be used here: it is a utility statement,
// not a query, and PostgreSQL does not accept bind parameters in it. The only
// way to make that form "work" is to interpolate the value into the SQL
// string, which is exactly the injection shape this avoids. set_config is an
// ordinary function call, so $1 binds normally.
export async function withActor<T>(
  actorId: string | null,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.actor_id', ${actorId}, true)`;

    return callback(tx);
  });
}

import { prisma } from "../../db/prisma.js";
import type { Actor } from "../../types/actor.js";

// THE SWAP POINT (§10.7). This is the Express replacement for the
// accessible_board_ids() SQL helper, and it must appear exactly once in the
// codebase: widening access later — an org-wide Director, say — is an edit
// here and nowhere else. That property is what let M3 widen the SQL version
// from owner-only to membership without touching a single policy.
//
// Membership alone is the whole answer: boards_add_owner_membership gives
// every board an owner row, so "owner ∪ member" collapses to "member".
//
// Never inline this query. If you find yourself writing
// `board_members.findMany({ where: { user_id } })` somewhere else, that is
// this function, and the swap point has just been lost.
export async function accessibleBoardIds(actor: Actor): Promise<string[]> {
  const rows = await prisma.board_members.findMany({
    where: { user_id: actor.id },
    select: { board_id: true },
  });

  return rows.map((row) => row.board_id);
}

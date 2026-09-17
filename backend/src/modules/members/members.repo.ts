import { prisma } from "../../db/prisma.js";
import { isBoardRole, type BoardRole } from "../../lib/permissions.js";

// The replacement for the board_role() SQL helper. A primary-key lookup:
// board_members is keyed on (board_id, user_id).
//
// Returns null for a non-member, and null for a role the matrix does not
// recognise — a row whose role somehow fell outside board_members_role_check
// is a broken row, and treating it as "no access" is the only safe reading.
export async function roleOf(boardId: string, userId: string): Promise<BoardRole | null> {
  const row = await prisma.board_members.findUnique({
    where: { board_id_user_id: { board_id: boardId, user_id: userId } },
    select: { role: true },
  });

  return row !== null && isBoardRole(row.role) ? row.role : null;
}

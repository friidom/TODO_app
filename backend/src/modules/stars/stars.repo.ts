import { prisma } from "../../db/prisma.js";

export interface StarRow {
  board_id: string;
  starred_at: string;
}

const toRow = (row: { board_id: string; created_at: Date }): StarRow => ({
  board_id: row.board_id,
  starred_at: row.created_at.toISOString(),
});

export async function findForUser(
  userId: string,
  boardIds: string[],
  limit: number,
): Promise<StarRow[]> {
  const rows = await prisma.board_stars.findMany({
    where: { user_id: userId, board_id: { in: boardIds } },
    orderBy: { created_at: "desc" },
    take: limit,
    select: { board_id: true, created_at: true },
  });

  return rows.map(toRow);
}

// createMany for its ON CONFLICT DO NOTHING: a racing second star is a no-op, not a unique violation.
export async function star(boardId: string, userId: string): Promise<StarRow> {
  await prisma.board_stars.createMany({
    data: [{ board_id: boardId, user_id: userId }],
    skipDuplicates: true,
  });

  const row = await prisma.board_stars.findUniqueOrThrow({
    where: { user_id_board_id: { user_id: userId, board_id: boardId } },
    select: { board_id: true, created_at: true },
  });

  return toRow(row);
}

export async function unstar(boardId: string, userId: string): Promise<void> {
  await prisma.board_stars.deleteMany({ where: { board_id: boardId, user_id: userId } });
}

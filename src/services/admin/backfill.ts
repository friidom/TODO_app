// M34 Phase C added todos.completed_at and backfilled every card already
// sitting in a done column with coalesce(updated_at, created_at) -- the date
// of its last edit of any kind, not the date it was finished. A card
// completed in March and retitled in August backfilled as August.
//
// So anything dated before this is best-available rather than observed, and
// a chart covering that range has to say so. The date is a constant because
// it is a property of the migration, not of the data: it does not change, and
// an endpoint field for one fixed timestamp would be a round trip per screen
// to learn something already known.
export const COMPLETION_BACKFILL_DATE = "2026-09-20";

export function coversBackfill(from: string): boolean {
  return from.slice(0, 10) < COMPLETION_BACKFILL_DATE;
}

export function backfillNote(from: string): string | undefined {
  if (!coversBackfill(from)) return undefined;

  return `Completions before ${COMPLETION_BACKFILL_DATE} are approximated from each card's last edit, not observed.`;
}

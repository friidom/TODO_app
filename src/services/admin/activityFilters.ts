// The active value is carried in even when no loaded row has it: a <select>
// whose value matches no <option> renders as its first one, so an applied
// ?action= read as "Every action" -- and re-picking that fired no change
// event, leaving the filter stuck on.
export function actionOptions(
  rows: { action: string }[],
  active: string | undefined,
): string[] {
  const options = new Set(rows.map((row) => row.action));

  if (active !== undefined) options.add(active);

  return [...options].sort();
}

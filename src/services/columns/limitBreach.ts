interface Limits {
  title: string;
  min_limit?: number | null;
  max_limit?: number | null;
}

/**
 * The warning shown in a column header when its work-item count falls outside
 * the configured limits, or `null` when it is within them.
 *
 * Limits are advisory: this only produces a message, it never blocks a drop.
 * See `limitBreach.check.ts` for the checks.
 */
export function limitBreach(column: Limits, count: number) {
  const { title, min_limit, max_limit } = column;

  if (max_limit != null && count > max_limit) {
    return `${count} work items in ${title}. Maximum is ${max_limit}.`;
  }

  if (min_limit != null && count < min_limit) {
    return `${count} work items in ${title}. Minimum is ${min_limit}.`;
  }

  return null;
}

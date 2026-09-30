// The six values and what they are called. The server owns what a period
// MEANS -- backend/src/modules/admin/periods.ts holds the range and bucket
// arithmetic and is the only place it exists. This file carries the list so
// the selector can render it, and nothing more.
//
// No shared fixture keeps the two honest, unlike permissions-matrix.json.
// That mitigation exists for a matrix whose drift would be silent; a period
// string that drifts from the server's Zod enum is a 400 on the first
// request, which is loud enough.
import { translated } from "@/components/i18n";

export const ADMIN_PERIODS = [
  "1d",
  "7d",
  "30d",
  "3m",
  "quarter",
  "year",
] as const;

export type AdminPeriod = (typeof ADMIN_PERIODS)[number];

export const DEFAULT_PERIOD: AdminPeriod = "7d";

export const PERIOD_LABELS = translated<AdminPeriod>({
  "1d": "time.today",
  "7d": "admin.periods.7d",
  "30d": "admin.periods.30d",
  "3m": "admin.periods.3m",
  quarter: "admin.periods.quarter",
  year: "admin.periods.year",
});

// "3 months" and "Quarter" sit next to each other in the selector and would
// otherwise look like the same thing said twice.
export const PERIOD_HINTS = translated<AdminPeriod>({
  "1d": "admin.periodHints.1d",
  "7d": "admin.periodHints.7d",
  "30d": "admin.periodHints.30d",
  "3m": "admin.periodHints.3m",
  quarter: "admin.periodHints.quarter",
  year: "admin.periodHints.year",
});

export function isAdminPeriod(value: unknown): value is AdminPeriod {
  return (
    typeof value === "string" &&
    (ADMIN_PERIODS as readonly string[]).includes(value)
  );
}

export function periodLabel(period: AdminPeriod): string {
  return PERIOD_LABELS[period];
}

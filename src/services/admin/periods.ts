// The six values and what they are called. The server owns what a period
// MEANS -- backend/src/modules/admin/periods.ts holds the range and bucket
// arithmetic and is the only place it exists. This file carries the list so
// the selector can render it, and nothing more.
//
// No shared fixture keeps the two honest, unlike permissions-matrix.json.
// That mitigation exists for a matrix whose drift would be silent; a period
// string that drifts from the server's Zod enum is a 400 on the first
// request, which is loud enough.
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

export const PERIOD_LABELS: Record<AdminPeriod, string> = {
  "1d": "Today",
  "7d": "7 days",
  "30d": "30 days",
  "3m": "3 months",
  quarter: "Quarter",
  year: "Year",
};

// "3 months" and "Quarter" sit next to each other in the selector and would
// otherwise look like the same thing said twice.
export const PERIOD_HINTS: Record<AdminPeriod, string> = {
  "1d": "Today so far",
  "7d": "The last 7 days",
  "30d": "The last 30 days",
  "3m": "A rolling three months",
  quarter: "This calendar quarter, to date",
  year: "This calendar year, to date",
};

export function isAdminPeriod(value: unknown): value is AdminPeriod {
  return (
    typeof value === "string" &&
    (ADMIN_PERIODS as readonly string[]).includes(value)
  );
}

export function periodLabel(period: AdminPeriod): string {
  return PERIOD_LABELS[period];
}

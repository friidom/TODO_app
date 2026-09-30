import i18n from "@/components/i18n";

interface Limits {
  title: string | null;
  min_limit?: number | null;
  max_limit?: number | null;
}

// advisory only — this produces a message, it never blocks a drop
export function limitBreach(column: Limits, count: number) {
  const { title: rawTitle, min_limit, max_limit } = column;
  const title = rawTitle ?? "";

  if (max_limit != null && count > max_limit) {
    return i18n.t("column.overMax", { count, title, limit: max_limit });
  }

  if (min_limit != null && count < min_limit) {
    return i18n.t("column.underMin", { count, title, limit: min_limit });
  }

  return null;
}

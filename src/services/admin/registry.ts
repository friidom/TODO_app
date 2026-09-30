import i18n from "@/components/i18n";

// The admin area declared as values, the shape services/views/registry.ts
// already uses for board views. The nav renders this list and a test pins it,
// so a section cannot be added to one and forgotten in the other.
export const ADMIN_SECTIONS = [
  "dashboard",
  "flow",
  "leaderboards",
  "users",
  "boards",
  "spaces",
  "activity",
  "kpi",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export interface AdminSectionDefinition {
  section: AdminSection;
  label: string;
  path: string;
}

export const ADMIN_SECTION_DEFINITIONS: Record<
  AdminSection,
  AdminSectionDefinition
> = {
  dashboard: {
    section: "dashboard",
    get label() {
      return i18n.t("admin.sections.dashboard");
    },
    path: "/admin",
  },
  flow: {
    section: "flow",
    get label() {
      return i18n.t("admin.sections.flow");
    },
    path: "/admin/flow",
  },
  leaderboards: {
    section: "leaderboards",
    get label() {
      return i18n.t("admin.sections.leaderboards");
    },
    path: "/admin/leaderboards",
  },
  users: {
    section: "users",
    get label() {
      return i18n.t("admin.sections.users");
    },
    path: "/admin/users",
  },
  boards: {
    section: "boards",
    get label() {
      return i18n.t("boards.title");
    },
    path: "/admin/boards",
  },
  spaces: {
    section: "spaces",
    get label() {
      return i18n.t("sidebar.spaces");
    },
    path: "/admin/spaces",
  },
  activity: {
    section: "activity",
    get label() {
      return i18n.t("board.activity");
    },
    path: "/admin/activity",
  },
  kpi: {
    section: "kpi",
    get label() {
      return i18n.t("admin.sections.kpi");
    },
    path: "/admin/kpi",
  },
};

export function adminSections(): AdminSectionDefinition[] {
  return ADMIN_SECTIONS.map((section) => ADMIN_SECTION_DEFINITIONS[section]);
}

// The four factual series one chart switches between (E2, V2). A fifth metric
// is an entry here plus a field on the endpoint, not a new screen.
export const SERIES_METRICS = [
  "completed_todos",
  "completed_points",
  "comments",
  "activities",
] as const;

export type SeriesMetric = (typeof SERIES_METRICS)[number];

export interface SeriesMetricDefinition {
  metric: SeriesMetric;
  label: string;
  // Semantic tokens, not the unused --chart-N ramp shadcn left behind:
  // TrendsChart.tsx uses these and they are the established palette.
  tone: string;
  fill: string;
  // Points are the one series that carries a second figure beside it, because
  // a points total without its unestimated count omits the work nobody sized.
  countsUnestimated: boolean;
}

export const SERIES_METRIC_DEFINITIONS: Record<
  SeriesMetric,
  SeriesMetricDefinition
> = {
  completed_todos: {
    metric: "completed_todos",
    get label() {
      return i18n.t("admin.metrics.completedTasks");
    },
    tone: "text-brand",
    fill: "bg-brand",
    countsUnestimated: false,
  },
  completed_points: {
    metric: "completed_points",
    get label() {
      return i18n.t("admin.metrics.completedPoints");
    },
    tone: "text-status-green",
    fill: "bg-status-green",
    countsUnestimated: true,
  },
  comments: {
    metric: "comments",
    get label() {
      return i18n.t("taskActivity.comments");
    },
    tone: "text-status-blue",
    fill: "bg-status-blue",
    countsUnestimated: false,
  },
  activities: {
    metric: "activities",
    get label() {
      return i18n.t("admin.metrics.activityEvents");
    },
    tone: "text-status-orange",
    fill: "bg-status-orange",
    countsUnestimated: false,
  },
};

export function seriesMetrics(): SeriesMetricDefinition[] {
  return SERIES_METRICS.map((metric) => SERIES_METRIC_DEFINITIONS[metric]);
}

import {
  ActivityIcon,
  ChartNoAxesColumnIcon,
  FolderIcon,
  LayoutGridIcon,
  type LucideIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  SquareKanbanIcon,
  TargetIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";

import i18n from "@/components/i18n";

// The admin area declared as values, the shape services/views/registry.ts
// already uses for board views. The nav renders this list and a test pins it,
// so a section cannot be added to one and forgotten in the other.
export const ADMIN_SECTIONS = [
  "dashboard",
  "users",
  "spaces",
  "boards",
  "flow",
  "leaderboards",
  "activity",
  "kpi",
  "access",
  "audit",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

// null is the ungrouped head of the nav: the objects an admin opens.
export const ADMIN_GROUPS = [null, "insights", "security"] as const;

export type AdminGroup = (typeof ADMIN_GROUPS)[number];

export interface AdminSectionDefinition {
  section: AdminSection;
  label: string;
  path: string;
  group: AdminGroup;
  icon: LucideIcon;
  // Whether the reporting period changes what the page shows. The header
  // offers the period selector only where it does.
  periodScoped: boolean;
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
    group: null,
    icon: LayoutGridIcon,
    periodScoped: true,
  },
  users: {
    section: "users",
    get label() {
      return i18n.t("admin.sections.users");
    },
    path: "/admin/users",
    group: null,
    icon: UsersIcon,
    periodScoped: true,
  },
  spaces: {
    section: "spaces",
    get label() {
      return i18n.t("sidebar.spaces");
    },
    path: "/admin/spaces",
    group: null,
    icon: FolderIcon,
    periodScoped: true,
  },
  boards: {
    section: "boards",
    get label() {
      return i18n.t("boards.title");
    },
    path: "/admin/boards",
    group: null,
    icon: SquareKanbanIcon,
    periodScoped: true,
  },
  flow: {
    section: "flow",
    get label() {
      return i18n.t("admin.sections.flow");
    },
    path: "/admin/flow",
    group: "insights",
    icon: ChartNoAxesColumnIcon,
    periodScoped: true,
  },
  leaderboards: {
    section: "leaderboards",
    get label() {
      return i18n.t("admin.sections.leaderboards");
    },
    path: "/admin/leaderboards",
    group: "insights",
    icon: TrophyIcon,
    periodScoped: true,
  },
  activity: {
    section: "activity",
    get label() {
      return i18n.t("board.activity");
    },
    path: "/admin/activity",
    group: "insights",
    icon: ActivityIcon,
    periodScoped: true,
  },
  kpi: {
    section: "kpi",
    get label() {
      return i18n.t("admin.sections.kpi");
    },
    path: "/admin/kpi",
    group: "insights",
    icon: TargetIcon,
    periodScoped: false,
  },
  access: {
    section: "access",
    get label() {
      return i18n.t("admin.sections.access");
    },
    path: "/admin/access",
    group: "security",
    icon: ShieldCheckIcon,
    periodScoped: false,
  },
  audit: {
    section: "audit",
    get label() {
      return i18n.t("admin.sections.audit");
    },
    path: "/admin/audit",
    group: "security",
    icon: ScrollTextIcon,
    periodScoped: false,
  },
};

export function adminSections(): AdminSectionDefinition[] {
  return ADMIN_SECTIONS.map((section) => ADMIN_SECTION_DEFINITIONS[section]);
}

export function adminGroupLabel(group: AdminGroup): string | null {
  return group === null ? null : i18n.t(`admin.groups.${group}`);
}

// The section a URL belongs to, detail pages included: /admin/users/:id is
// People. "/admin" itself only matches exactly, or it would own every path.
export function sectionForPath(pathname: string): AdminSectionDefinition {
  const path = pathname.replace(/\/+$/, "");

  return (
    adminSections().find(
      (definition) =>
        definition.path !== "/admin" &&
        (path === definition.path || path.startsWith(`${definition.path}/`)),
    ) ?? ADMIN_SECTION_DEFINITIONS.dashboard
  );
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

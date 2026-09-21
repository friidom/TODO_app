import { Fragment } from "react";
import { Link } from "react-router";

import type { Crumb } from "@/services/admin/drilldown";

export default function AdminCrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
      {trail.map((crumb, index) => (
        <Fragment key={`${crumb.label}-${index}`}>
          <span className="text-ink-3/50 text-mini" aria-hidden>
            ›
          </span>

          {crumb.to === undefined ? (
            <span
              className="text-ink-2 text-mini max-w-40 truncate"
              aria-current="page"
            >
              {crumb.label}
            </span>
          ) : (
            <Link
              to={crumb.to}
              className="text-ink-3 hover:text-ink text-mini max-w-40 truncate transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

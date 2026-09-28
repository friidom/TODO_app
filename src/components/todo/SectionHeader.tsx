import type { ReactNode } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  type LucideIcon,
} from "lucide-react";

import { COUNT_CHIP, SECTION_TITLE } from "./detailChrome";
import { cn } from "@/utils/cn";

export default function SectionHeader({
  title,
  count,
  collapse,
  actions,
}: {
  title: string;
  count?: ReactNode;
  collapse?: { collapsed: boolean; onToggle: () => void; noun: string };
  actions?: ReactNode;
}) {
  const label = (
    <>
      <span className={SECTION_TITLE}>{title}</span>
      {count != null && <span className={COUNT_CHIP}>{count}</span>}
    </>
  );

  return (
    <div className="mb-2.5 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1.5">
      <h3 className="flex min-w-0 items-center gap-2">
        {collapse ? (
          <button
            type="button"
            aria-expanded={!collapse.collapsed}
            aria-label={`${collapse.collapsed ? "Expand" : "Collapse"} ${collapse.noun}`}
            onClick={collapse.onToggle}
            className="hover:bg-wash-strong focus-visible:ring-brand rounded-control -ml-1.5 flex h-7 items-center gap-2 px-1.5 transition-colors duration-150 outline-none focus-visible:ring-2"
          >
            {label}
            {collapse.collapsed ? (
              <ChevronRightIcon className="text-ink-3 size-3.5 shrink-0" />
            ) : (
              <ChevronDownIcon className="text-ink-3 size-3.5 shrink-0" />
            )}
          </button>
        ) : (
          label
        )}
      </h3>

      {actions && (
        <div className="ml-auto flex min-w-0 items-center gap-1">{actions}</div>
      )}
    </div>
  );
}

export function EmptyLine({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-ink-3 text-meta flex flex-wrap items-center gap-2 py-1",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" />
      {children}
    </div>
  );
}

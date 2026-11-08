import type { KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlertIcon, XIcon, type LucideIcon } from "lucide-react";

import { SearchField } from "@/components/board/FilterPopover";
import { SkeletonRegion } from "@/components/loading/ViewSkeleton";
import IconButton from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { FLYOUT_LINK, FLYOUT_ROW_SELECTOR } from "./flyoutChrome";

// ↑/↓ walk the rows, and ↓ from the search field enters the list.
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

  const rows = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(FLYOUT_ROW_SELECTOR),
  ];

  if (rows.length === 0) return;

  const at = rows.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "ArrowDown"
      ? at < 0
        ? 0
        : Math.min(at + 1, rows.length - 1)
      : at <= 0
        ? -1
        : at - 1;

  event.preventDefault();

  if (next < 0) {
    event.currentTarget.querySelector<HTMLElement>("input")?.focus();
  } else {
    rows[next]!.focus();
  }
}

export function FlyoutFrame({
  title,
  onClose,
  query,
  onQuery,
  searchLabel,
  toolbar,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  query: string;
  onQuery: (value: string) => void;
  searchLabel: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div
      onKeyDown={moveFocus}
      className="flex max-h-[min(34rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col"
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h2 className="text-ink text-sm font-semibold">{title}</h2>

        <IconButton
          label={t("common.close")}
          size="xs"
          onClick={onClose}
          className="ml-auto"
        >
          <XIcon />
        </IconButton>
      </div>

      <div className="flex flex-col gap-2 px-3 pb-2">
        <SearchField
          value={query}
          onChange={onQuery}
          placeholder={searchLabel}
          label={searchLabel}
        />
        {toolbar}
      </div>

      <div className="border-hairline min-h-0 flex-1 overflow-y-auto overscroll-contain border-t p-1.5">
        {children}
      </div>

      {footer && (
        <div className="border-hairline flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2.5">
          {footer}
        </div>
      )}
    </div>
  );
}

export function FlyoutSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonRegion className="flex flex-col gap-1 p-0.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
          <Skeleton className="rounded-control size-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton
              className="h-3 rounded-full"
              style={{ width: `${55 + ((i * 13) % 35)}%` }}
            />
            <Skeleton className="mt-1.5 h-2.5 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

export function FlyoutState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-9 text-center">
      <span className="bg-ink/[0.06] text-ink-3 mb-2 grid size-9 place-items-center rounded-full">
        <Icon className="size-4" />
      </span>
      <p className="text-ink text-meta font-medium">{title}</p>
      {hint && (
        <p className="text-ink-3 max-w-[17rem] text-xs leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FlyoutError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className={cn(
        "bg-status-red/8 text-meta flex items-center gap-2 rounded-lg px-2.5 py-2",
        className,
      )}
    >
      <CircleAlertIcon className="text-status-red size-4 shrink-0" />
      <span className="text-ink min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className={cn(FLYOUT_LINK, "text-brand hover:text-brand px-1")}
      >
        {t("common.retry")}
      </button>
    </div>
  );
}

export function FlyoutGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-ink-3 text-micro px-2 pt-2.5 pb-1 font-semibold tracking-wide uppercase">
      {children}
    </p>
  );
}

export function BoardChip({ title }: { title: string }) {
  return (
    <span
      aria-hidden
      className="bg-brand-soft text-brand rounded-control text-meta grid size-7 shrink-0 place-items-center font-semibold"
    >
      {title.trim().charAt(0).toUpperCase() || "·"}
    </span>
  );
}
